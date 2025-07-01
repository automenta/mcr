% Ontology for family relationships

parent(X, Y) :- father(X, Y).
parent(X, Y) :- mother(X, Y).

father(john, mary).
father(john, peter).
mother(jane, mary).
mother(jane, peter).

child(X, Y) :- parent(Y, X).

sibling(X, Y) :- parent(Z, X), parent(Z, Y), X \= Y.

grandparent(X, Y) :- parent(X, Z), parent(Z, Y).

grandchild(X, Y) :- grandparent(Y, X).
