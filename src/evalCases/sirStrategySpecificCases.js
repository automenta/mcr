// src/evalCases/sirStrategySpecificCases.js

// These cases are designed to test the nuances of different SIR strategies.
module.exports = [
  {
    "id": "sir_fewshot_01_ambiguous_relation",
    "description": "Tests SIRR2FewShot: Handles potentially ambiguous relational phrase that few-shot examples might clarify.",
    "naturalLanguageInput": "The device X is connected with component Y.",
    "inputType": "assert",
    "expectedProlog": ["connected_to(device_x, component_y)."],
    "tags": ["sir-fewshot", "relation"],
    "notes": "Assumes 'connected with' should map to 'connected_to' based on few-shot examples common patterns."
  },
  {
    "id": "sir_fewshot_02_implicit_rule",
    "description": "Tests SIRR2FewShot: NL implies a rule that needs careful structuring, few-shot examples of rules should help.",
    "naturalLanguageInput": "Anything that consumes power needs a power source.",
    "inputType": "assert",
    "expectedProlog": ["needs_power_source(X) :- consumes_power(X)."],
    "tags": ["sir-fewshot", "rule"],
    "notes": "The structure 'Anything that A B' should be guided by rule examples in few-shot prompt."
  },
  {
    "id": "sir_detailed_01_complex_composition",
    "description": "Tests SIRR3DetailedGuidance: Input describes a complex composition that needs precise SIR structure.",
    "naturalLanguageInput": "System Alpha consists of a main module, two auxiliary units, and a sensor package which itself contains a thermal sensor and a light sensor.",
    "inputType": "assert",
    "expectedProlog": [
      "is_composed_of(system_alpha, [main_module, auxiliary_unit_1, auxiliary_unit_2, sensor_package]).",
      "is_composed_of(sensor_package, [thermal_sensor, light_sensor])."
    ],
    "tags": ["sir-detailed", "composition", "nested"],
    "notes": "The detailed guidance should help in correctly forming the 'is_composed_of' SIR, especially the nested part. Expecting 'auxiliary_unit_1' and 'auxiliary_unit_2' if the LLM infers distinctness or similar if it just lists 'auxiliary_unit' twice. For this test, we assume it enumerates them if quantity is specified. A more robust test might make the NL less specific about count and check for a single 'auxiliary_unit'."
  },
  {
    "id": "sir_detailed_02_conditional_fact_as_rule",
    "description": "Tests SIRR3DetailedGuidance: Input might seem like a fact but has a condition, detailed guidance on rule structure should help.",
    "naturalLanguageInput": "A component is considered critical if its failure leads to system shutdown.",
    "inputType": "assert",
    "expectedProlog": ["is_critical(Component) :- leads_to_system_shutdown(failure_of(Component))."],
    "tags": ["sir-detailed", "rule", "conditional"],
    "notes": "This requires recognizing the conditional nature and forming a rule. 'failure_of(Component)' is an assumed predicate structure for the condition."
  },
  {
    "id": "sir_detailed_03_negated_complex_fact",
    "description": "Tests SIRR3DetailedGuidance: A more complex fact that is negated.",
    "naturalLanguageInput": "The primary server does not host the user database nor the logging service.",
    "inputType": "assert",
    "expectedProlog": [
      "not(hosts(primary_server, user_database)).",
      "not(hosts(primary_server, logging_service))."
    ],
    "tags": ["sir-detailed", "negation", "multiple-clauses"],
    "notes": "The detailed guidance should help in correctly applying negation to multiple implied facts."
  }
];
