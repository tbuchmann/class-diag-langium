grammar ClassDiagram

type Type =
    Class | Interface | DataType | Enumeration | Association;

entry Model:
    packages+=Package*;

Package:
    'package' name=ID '{'
        (packages+=Package | types+=(Class|Interface|DataType|Enumeration|Association) )*
    '}';

TypedElement:
    Property | Operation;

Property:
    (vis=VisibilityKind)? name=ID ':' type=[Type:ID] (lower=INT '..' upper=INT)?
    ;

Operation:
    (vis=VisibilityKind)? type=[Type:ID] name=ID '(' params+=Parameter* ')'
    ;

Parameter:
    name=ID ':' type=[Type:ID];

Class returns Type:
    {infer Class} (vis=VisibilityKind)? 'class' name=ID ('extends' superClasses+=[Class:ID] (',' superClasses+=[Class:ID])*)? '{'
        (properties+=Property | operations+=Operation)*
    '}';

Interface returns Type:
    {infer Interface} (vis=VisibilityKind)? 'interface' (superInterfaces+=[Interface:ID] (',' superInterfaces+=[Interface:ID])*)? name=ID '{'
        (properties+=Property | operations+=Operation)*
    '}';

DataType returns Type:
    {infer DataType} (vis=VisibilityKind)? 'dt' name=ID '{'
        properties+=Property*
    '}';

Enumeration returns Type:
    {infer Enumeration} 'enum' name=ID;

Association returns Type:
    {infer Association} 'assoc' name=ID '{'
        memberEnds+=MemberEnd*
    '}';

MemberEnd:
    prop=Property (kind=AggregationKind)? (navigable?='+') ;

AggregationKind returns string:
    'none' | 'shared' | 'composite';

VisibilityKind returns string:
    'public' | 'protected' | 'private' | 'package';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
