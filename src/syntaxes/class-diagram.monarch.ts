// Monarch syntax highlighting for the class-diagram language.
export default {
    keywords: [
        'abstract','assoc','class','composite','datatype','enum','extends','impl','implements','interface','none','package','primitive','private','protected','public','shared','spec','static','x'
    ],
    operators: [
        ',','..','/',':'
    ],
    symbols: /\(|\)|,|\.\.|\/|:|\[|\]|\{|\}/,

    tokenizer: {
        initial: [
            { regex: /[_a-zA-Z][\w_]*/, action: { cases: { '@keywords': {"token":"keyword"}, '@default': {"token":"ID"} }} },
            { regex: /-?[0-9]+/, action: {"token":"number"} },
            { regex: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/, action: {"token":"string"} },
            { regex: /<<[\s\S]*?>>/, action: {"token":"IMPL_BODY"} },
            { include: '@whitespace' },
            { regex: /@symbols/, action: { cases: { '@operators': {"token":"operator"}, '@default': {"token":""} }} },
        ],
        whitespace: [
            { regex: /\s+/, action: {"token":"white"} },
            { regex: /\/\*/, action: {"token":"comment","next":"@comment"} },
            { regex: /\/\/[^\n\r]*/, action: {"token":"comment"} },
        ],
        comment: [
            { regex: /[^/\*]+/, action: {"token":"comment"} },
            { regex: /\*\//, action: {"token":"comment","next":"@pop"} },
            { regex: /[/\*]/, action: {"token":"comment"} },
        ],
    }
};
