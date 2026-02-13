grammar ClassDiagram

type Type =
    Classifier | DataType | PrimitiveType | Enumeration | Association;

type Classifier = Class | Interface;

entry Model:
    packages+=Package*;

Package:
    'package' name=ID '{'
        (packages+=Package | types+=(Class|Interface|DataType|PrimitiveType|Enumeration|Association) )*
    '}';

type TypedElement =
    Property | Operation | Parameter;

/*
interface TypedElement {
    name: string;
    type: Type;
    lower: number=0;
    upper: number=1;
}
*/
Property returns TypedElement:
    {infer Property} (vis=VisibilityKind)? (static?='static')? (derived?='/')? name=ID ':' type=[Type:ID] ('[' lower=INT '..' upper=INT ']')? (kind=AggregationKind)? (notnavigable?='x')?
    ;

Operation returns TypedElement:
    {infer Operation} (vis=VisibilityKind)? (static?='static')? (abstract?='abstract')? name=ID '(' (params+=Parameter (',' params+=Parameter)*)? ')' (':' type=[Type:ID] ('[' lower=INT '..' upper=INT ']')?)? '{'
    ('spec' description=STRING)?
    ('impl' target=ID content=IMPL_BODY)?
    '}';

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
    {infer DataType} (vis=VisibilityKind)? 'datatype' name=ID '{'
        properties+=Property*
    '}';

PrimitiveType returns Type:
    {infer PrimitiveType} 'primitive' name=ID;

Enumeration returns Type:
    {infer Enumeration} 'enum' name=ID '{'
        literals+=ID (',' literals+=ID)*
    '}';

Association returns Type:
    {infer Association} 'assoc' name=ID '{'
        properties+=Property*
    '}';

// ImplContent:
//     body+=( ID )+
//     ;
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

terminal IMPL_BODY: /<<[\s\S]*?>>/;
