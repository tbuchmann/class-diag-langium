grammar ClassDiagram

type Type =
    Class | Interface | DataType | PrimitiveType | Enumeration | Association;

entry Model:
    packages+=Package*;

Package:
    'package' name=ID '{'
        (packages+=Package | types+=(Class|Interface|DataType|PrimitiveType|Enumeration|Association) )*
    '}';

type TypedElement =
    Property | Operation | Parameter;

Property returns TypedElement:
    {infer Property} (vis=VisibilityKind)? (static?='static')? name=ID ':' type=[Type:ID] ('[' lower=INT '..' upper=INT ']')? (kind=AggregationKind)? (navigable?='+')?
    ;

Operation returns TypedElement:
    {infer Operation} (vis=VisibilityKind)? (static?='static')? (abstract?='abstract')? name=ID '(' params+=Parameter* ')' (':' type=[Type:ID] ('[' lower=INT '..' upper=INT ']')?)?
    ;

Parameter returns TypedElement:
    {infer Parameter} name=ID ':' type=[Type:ID] ('[' lower=INT '..' upper=INT ']')?;

Class returns Type:
    {infer Class} (vis=VisibilityKind)? (abstract?='abstract')? 'class' name=ID 
    ('extends' superClasses+=[Class:ID] (',' superClasses+=[Class:ID])*)? 
    ('implements' superInterfaces+=[Interface:ID] (',' superInterfaces+=[Interface:ID])*)? '{'
        (properties+=Property | operations+=Operation)*
    '}';

Interface returns Type:
    {infer Interface} (vis=VisibilityKind)? 'interface' name=ID 
    ('extends' superInterfaces+=[Interface:ID] (',' superInterfaces+=[Interface:ID])*)? '{'
        (properties+=Property | operations+=Operation)*
    '}';

DataType returns Type:
    {infer DataType} (vis=VisibilityKind)? 'dt' name=ID '{'
        properties+=Property*
    '}';

PrimitiveType returns Type:
    {infer PrimitiveType} 'pt' name=ID;

Enumeration returns Type:
    {infer Enumeration} 'enum' name=ID '{'
        literals+=ID (',' literals+=ID)*
    '}';

Association returns Type:
    {infer Association} 'assoc' name=ID '{'
        properties+=Property*
    '}';
/*
MemberEnd:
    prop=Property (kind=AggregationKind)? (navigable?='+') ;
*/
AggregationKind returns string:
    'none' | 'shared' | 'composite';

VisibilityKind returns string:
    'public' | 'protected' | 'private' | 'package';

/*
QualifiedName returns string:
    ID ('.' ID)*;
*/
hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /-?[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
