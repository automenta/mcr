#!/bin/bash

# Model Context Reasoner (MCR) Demo Script
# This script demonstrates common CLI operations for the MCR.
# Ensure the MCR server is running before executing session-dependent commands.
# You can start the server with: node mcr.js (in a separate terminal)

BASE_CLI_COMMAND="node mcr-cli.js"
SESSION_ID_FILE="demo_session_id.txt" # File to store the session ID

echo "### MCR Demo Script ###"
echo "-----------------------"

# 1. Check Server Status
echo ""
echo "1. Checking MCR server status..."
$BASE_CLI_COMMAND status
echo "-----------------------"
sleep 1

# 2. Create a New Session
echo ""
echo "2. Creating a new session..."
SESSION_OUTPUT=$($BASE_CLI_COMMAND create-session)
echo "$SESSION_OUTPUT"

# Extract sessionId using jq if available, otherwise basic parsing
SESSION_ID=""
if command -v jq &> /dev/null; then
    SESSION_ID=$(echo "$SESSION_OUTPUT" | jq -r '.sessionId')
else
    # Basic parsing: assumes sessionId is the first quoted string after "sessionId":
    SESSION_ID=$(echo "$SESSION_OUTPUT" | grep -o '"sessionId": *"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
    echo "Error: Could not extract sessionId. Please ensure 'jq' is installed or check create-session output."
    echo "If the server is not running, this step will fail."
    exit 1
fi
echo "$SESSION_ID" > $SESSION_ID_FILE
echo "Session ID: $SESSION_ID (saved to $SESSION_ID_FILE)"
echo "-----------------------"
sleep 1

# 3. Assert a Fact
echo ""
echo "3. Asserting a fact into session $SESSION_ID..."
echo '(Example: "The sky is blue.")'
$BASE_CLI_COMMAND assert "$SESSION_ID" "The sky is blue. Cats are mammals."
echo "-----------------------"
sleep 1

# 4. Query the Session
echo ""
echo "4. Querying the session $SESSION_ID..."
echo '(Example: "What color is the sky?")'
$BASE_CLI_COMMAND query "$SESSION_ID" "What color is the sky?"
echo ""
echo '(Example: "Are cats mammals?")'
$BASE_CLI_COMMAND query "$SESSION_ID" "Are cats mammals?"
echo "-----------------------"
sleep 1

# 5. Add an Ontology (using family.pl)
ONTOLOGY_NAME="family_demo"
ONTOLOGY_FILE="ontologies/family.pl"
if [ -f "$ONTOLOGY_FILE" ]; then
    echo ""
    echo "5. Adding '$ONTOLOGY_NAME' ontology from '$ONTOLOGY_FILE'..."
    $BASE_CLI_COMMAND add-ontology "$ONTOLOGY_NAME" "$ONTOLOGY_FILE"
    echo "-----------------------"
    sleep 1

    # 6. Assert facts relevant to the family ontology
    echo ""
    echo "6. Asserting family-related facts into session $SESSION_ID..."
    $BASE_CLI_COMMAND assert "$SESSION_ID" "father(john, mary). mother(jane, mary). father(peter, john)."
    echo "-----------------------"
    sleep 1

    # 7. Query using the family ontology context (implicitly loaded by server now)
    #    Or demonstrate dynamic ontology loading with -o flag if preferred for CLI demo
    echo ""
    echo "7. Querying with family ontology context in session $SESSION_ID..."
    echo '(Example: "Who is marys father?")'
    $BASE_CLI_COMMAND query "$SESSION_ID" "Who is marys father?"
    echo ""
    echo '(Example: "Who is marys grandfather?")'
    $BASE_CLI_COMMAND query "$SESSION_ID" "Who is marys grandfather?"
    echo "-----------------------"
    sleep 1
else
    echo ""
    echo "Skipping ontology demo steps: $ONTOLOGY_FILE not found."
    echo "-----------------------"
fi

# NEW: Demonstrate Prompt Commands
echo ""
echo "NEW: Demonstrating Prompt CLI commands..."
echo "Listing available prompt templates:"
$BASE_CLI_COMMAND prompt list
echo ""
echo "Showing content of 'NL_TO_RULES' template:"
$BASE_CLI_COMMAND prompt show NL_TO_RULES
echo ""
echo "Debugging 'QUERY_TO_PROLOG' template with example variables:"
$BASE_CLI_COMMAND prompt debug QUERY_TO_PROLOG "{\"question\":\"What is the capital of France?\"}"
echo "-----------------------"
sleep 1

# 9. Interactive Chat Mode (Informational) - Renumbered
echo ""
echo "9. Interactive Chat Mode (Example - Manual Interaction Required)"
echo "You can try interactive chat with:"
echo "$BASE_CLI_COMMAND chat"
echo "Or with the family ontology (if added):"
echo "$BASE_CLI_COMMAND chat -o $ONTOLOGY_FILE"
echo "Type 'exit' or 'quit' to end the chat."
echo "-----------------------"
sleep 1

# 9. Delete the Session
echo ""
echo "9. Deleting session $SESSION_ID..."
$BASE_CLI_COMMAND delete-session "$SESSION_ID"
if [ -f "$SESSION_ID_FILE" ]; then
    rm $SESSION_ID_FILE
fi
echo "-----------------------"
sleep 1

# 10. Delete the Ontology (if added)
if [ -f "$ONTOLOGY_FILE" ]; then
    echo ""
    echo "10. Deleting ontology '$ONTOLOGY_NAME'..."
    $BASE_CLI_COMMAND delete-ontology "$ONTOLOGY_NAME"
    echo "-----------------------"
fi

echo ""
echo "### MCR Demo Script Finished ###"
