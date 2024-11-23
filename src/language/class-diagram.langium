grammar ClassDiagram

entry Model:
    (packages+=Package | types+=Type)*;

Package:
    'package' name=ID '{'
        (packages+=Package | types+=Type)*
    '}';

Type:
    Class | Interface | DataType | Enumeration | Association;

TypedElement:
    Property | Operation;

Property:
    (vis=VisibilityKind)? name=ID type=[Type:ID] (lower=INT '..' upper=INT)?
    ;

Operation:
    (vis=VisibilityKind)? type=[Type:ID] name=ID '(' params+=Parameter* ')'
    ;

Parameter:
    name=ID ':' type=[Type:ID];

Class:
    (vis=VisibilityKind)? 'class' name=ID '{'
        (properties+=Property | operations+=Operation)*
    '}';

Interface:
    (vis=VisibilityKind)? 'interface' name=ID '{'
        (properties+=Property | operations+=Operation)*
    '}';

DataType:
    (vis=VisibilityKind)? 'dt' name=ID '{'
        properties+=Property*
    '}';

Enumeration:
    'enum' name=ID;

Association:
    'assoc' name=ID '{'
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
