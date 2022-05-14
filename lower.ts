import * as AST from './ast';
import * as IR from './ir';
import { Type } from './ast';
import { GlobalEnv } from './compiler';
import { NUM, STRING } from './utils';

const nameCounters : Map<string, number> = new Map();
function generateName(base : string) : string {
  if(nameCounters.has(base)) {
    var cur = nameCounters.get(base);
    nameCounters.set(base, cur + 1);
    return base + (cur + 1);
  }
  else {
    nameCounters.set(base, 1);
    return base + 1;
  }
}

// function lbl(a: Type, base: string) : [string, IR.Stmt<Type>] {
//   const name = generateName(base);
//   return [name, {tag: "label", a: a, name: name}];
// }

export function lowerProgram(p : AST.Program<Type>, env : GlobalEnv) : IR.Program<Type> {
    var blocks : Array<IR.BasicBlock<Type>> = [];
    var firstBlock : IR.BasicBlock<Type> = { a: p.a, label: generateName("$startProg"), stmts: [] }
    blocks.push(firstBlock);
    var inits = flattenStmts(p.stmts, blocks, env);
    return {
        a: p.a,
        funs: lowerFunDefs(p.funs, env),
        inits: [...inits, ...lowerVarInits(p.inits, env)],
        classes: lowerClasses(p.classes, env),
        body: blocks
    }
}

function lowerFunDefs(fs : Array<AST.FunDef<Type>>, env : GlobalEnv) : Array<IR.FunDef<Type>> {
    return fs.map(f => lowerFunDef(f, env)).flat();
}

function lowerFunDef(f : AST.FunDef<Type>, env : GlobalEnv) : IR.FunDef<Type> {
  var blocks : Array<IR.BasicBlock<Type>> = [];
  var firstBlock : IR.BasicBlock<Type> = {  a: f.a, label: generateName("$startFun"), stmts: [] }
  blocks.push(firstBlock);
  var bodyinits = flattenStmts(f.body, blocks, env);
    return {...f, inits: [...bodyinits, ...lowerVarInits(f.inits, env)], body: blocks}
}

function lowerVarInits(inits: Array<AST.VarInit<Type>>, env: GlobalEnv) : Array<IR.VarInit<Type>> {
    return inits.map(i => lowerVarInit(i, env));
}

function lowerVarInit(init: AST.VarInit<Type>, env: GlobalEnv) : IR.VarInit<Type> {
    return {
        ...init,
        value: literalToVal(init.value)
    }
}

function lowerClasses(classes: Array<AST.Class<Type>>, env : GlobalEnv) : Array<IR.Class<Type>> {
    return classes.map(c => lowerClass(c, env));
}

function lowerClass(cls: AST.Class<Type>, env : GlobalEnv) : IR.Class<Type> {
    return {
        ...cls,
        fields: lowerVarInits(cls.fields, env),
        methods: lowerFunDefs(cls.methods, env)
    }
}

function literalToVal(lit: AST.Literal) : IR.Value<Type> {
    switch(lit.tag) {
        case "num":
            return { ...lit, value: BigInt(lit.value) }
        case "bool":
            return lit
        case "str":
            return lit
        case "none":
            return lit        
    }
}

function flattenStmts(s : Array<AST.Stmt<Type>>, blocks: Array<IR.BasicBlock<Type>>, env : GlobalEnv) : Array<IR.VarInit<Type>> {
  var inits: Array<IR.VarInit<Type>> = [];
  s.forEach(stmt => {
    inits.push(...flattenStmt(stmt, blocks, env));
  });
  return inits;
}

//string case 
/*
vale = "abcd"

*/
// function storeStr(s:AST.Stmt<Type>,blocks: Array<IR.BasicBlock<Type>>,str: string): IR.Stmt<AST.Type>[]{

//   var len = s.length;
//   for (var i = 0; i < len; i++){
//     var ascii = str.charCodeAt(i);
//     var store_stmt = {
//       tag: "store",
//       a: s.a,
//       start: oval,
//       offset: offset,
//       value: nval
//     };
//     blocks[blocks.length - 1].stmts.push()

//   }
//   return;
// }



function flattenStmt(s : AST.Stmt<Type>, blocks: Array<IR.BasicBlock<Type>>, env : GlobalEnv) : Array<IR.VarInit<Type>> {
  switch(s.tag) {
    case "assign":
      var [valinits, valstmts, vale] = flattenExprToExpr(s.value, env);
      blocks[blocks.length - 1].stmts.push(...valstmts, { a: s.a, tag: "assign", name: s.name, value: vale});
      return valinits
      // return [valinits, [
      //   ...valstmts,
      //   { a: s.a, tag: "assign", name: s.name, value: vale}
      // ]];

    case "return":
    var [valinits, valstmts, val] = flattenExprToVal(s.value, env);
    blocks[blocks.length - 1].stmts.push(
         ...valstmts,
         {tag: "return", a: s.a, value: val}
    );
    return valinits;
    // return [valinits, [
    //     ...valstmts,
    //     {tag: "return", a: s.a, value: val}
    // ]];
  
    case "expr":
      var [inits, stmts, e] = flattenExprToExpr(s.expr, env);
      blocks[blocks.length - 1].stmts.push(
        ...stmts, {tag: "expr", a: s.a, expr: e }
      );
      return inits;
    //  return [inits, [ ...stmts, {tag: "expr", a: s.a, expr: e } ]];

    case "pass":
      return [];

    case "field-assign": {
      var [oinits, ostmts, oval] = flattenExprToVal(s.obj, env);
      var [ninits, nstmts, nval] = flattenExprToVal(s.value, env);
      if(s.obj.a.tag !== "class") { throw new Error("Compiler's cursed, go home."); }
      const classdata = env.classes.get(s.obj.a.name);
      const offset : IR.Value<Type> = { tag: "wasmint", value: classdata.get(s.field)[0] };
      pushStmtsToLastBlock(blocks,
        ...ostmts, ...nstmts, {
          tag: "store",
          a: s.a,
          start: oval,
          offset: offset,
          value: nval
        });
      return [...oinits, ...ninits];
    }
      // return [[...oinits, ...ninits], [...ostmts, ...nstmts, {
      //   tag: "field-assign",
      //   a: s.a,
      //   obj: oval,
      //   field: s.field,
      //   value: nval
      // }]];

    case "if":
      var thenLbl = generateName("$then")
      var elseLbl = generateName("$else")
      var endLbl = generateName("$end")
      var endjmp : IR.Stmt<Type> = { tag: "jmp", lbl: endLbl };
      var [cinits, cstmts, cexpr] = flattenExprToVal(s.cond, env);
      var condjmp : IR.Stmt<Type> = { tag: "ifjmp", cond: cexpr, thn: thenLbl, els: elseLbl };
      pushStmtsToLastBlock(blocks, ...cstmts, condjmp);
      blocks.push({  a: s.a, label: thenLbl, stmts: [] })
      var theninits = flattenStmts(s.thn, blocks, env);
      pushStmtsToLastBlock(blocks, endjmp);
      blocks.push({  a: s.a, label: elseLbl, stmts: [] })
      var elseinits = flattenStmts(s.els, blocks, env);
      pushStmtsToLastBlock(blocks, endjmp);
      blocks.push({  a: s.a, label: endLbl, stmts: [] })
      return [...cinits, ...theninits, ...elseinits]

      // return [[...cinits, ...theninits, ...elseinits], [
      //   ...cstmts, 
      //   condjmp,
      //   startlbl,
      //   ...thenstmts,
      //   endjmp,
      //   elslbl,
      //   ...elsestmts,
      //   endjmp,
      //   endlbl,
      // ]];
    
    case "while":
      var whileStartLbl = generateName("$whilestart");
      var whilebodyLbl = generateName("$whilebody");
      var whileEndLbl = generateName("$whileend");

      pushStmtsToLastBlock(blocks, { tag: "jmp", lbl: whileStartLbl })
      blocks.push({  a: s.a, label: whileStartLbl, stmts: [] })
      var [cinits, cstmts, cexpr] = flattenExprToVal(s.cond, env);
      pushStmtsToLastBlock(blocks, ...cstmts, { tag: "ifjmp", cond: cexpr, thn: whilebodyLbl, els: whileEndLbl });

      blocks.push({  a: s.a, label: whilebodyLbl, stmts: [] })
      var bodyinits = flattenStmts(s.body, blocks, env);
      pushStmtsToLastBlock(blocks, { tag: "jmp", lbl: whileStartLbl });

      blocks.push({  a: s.a, label: whileEndLbl, stmts: [] })

      return [...cinits, ...bodyinits]
  }
}

function flattenExprToExpr(e : AST.Expr<Type>, env : GlobalEnv) : [Array<IR.VarInit<Type>>, Array<IR.Stmt<Type>>, IR.Expr<Type>] {
  switch(e.tag) {
    // case "indexing":
      
    //   if (e.value.tag == "str") {
    //     let v = e.value;
    //     const strLength:number = v.value.length;
    //     const alloc_string : IR.Expr<Type> = { tag: "alloc", amount: { tag: "wasmint", value: strLength + 1 } };
    //     var assigns_string : IR.Stmt<Type>[] = [];
    //     const newStrName = generateName("newStr"); 
    //     console.log(strLength);
    //     assigns_string.push({
    //       tag: "store",
    //       start: {tag: "id", name: newStrName},
    //       offset: {tag:"wasmint", value: 0},
    //       value: {a:NUM , tag:"wasmint", value:strLength}
    //     });
    //     for (var i=1; i<=strLength;i++){
    //       const ascii = v.value.charCodeAt(i-1);
    //       assigns_string.push({
    //         tag: "store",
    //         start: {tag: "id", name: newStrName},
    //         offset: {tag:"wasmint", value: i},
    //         value: {a:NUM , tag:"wasmint", value:ascii}
    //       });
    //     }
    //     return [
    //       //[ { name: newStrName, type: e.a, value: { tag: "str", value: v.value } }],
    //       [ { name: newStrName, type: e.a, value: { tag: "none" } }],
    //       [ { tag: "assign", name: newStrName, value: alloc_string }, ...assigns_string,
    //       //  { tag: "expr", expr: { tag: "call", name: `${e.name}$__init__`, arguments: [{ a: e.a, tag: "id", name: newName }] } }
    //       ],
    //       {  tag: "value", value: { a: e.a, tag: "id", name: newStrName } }
    //     ];
    //   }

    //   return;
    case "uniop":
      var [inits, stmts, val] = flattenExprToVal(e.expr, env);
      return [inits, stmts, {
        ...e,
        expr: val
      }];
    case "binop":
      var [linits, lstmts, lval] = flattenExprToVal(e.left, env);
      var [rinits, rstmts, rval] = flattenExprToVal(e.right, env);
      return [[...linits, ...rinits], [...lstmts, ...rstmts], {
          ...e,
          left: lval,
          right: rval
        }];
    case "builtin1":
      var [inits, stmts, val] = flattenExprToVal(e.arg, env);
      return [inits, stmts, {tag: "builtin1", a: e.a, name: e.name, arg: val}];
    case "builtin2":
      var [linits, lstmts, lval] = flattenExprToVal(e.left, env);
      var [rinits, rstmts, rval] = flattenExprToVal(e.right, env);
      return [[...linits, ...rinits], [...lstmts, ...rstmts], {
          ...e,
          left: lval,
          right: rval
        }];
    case "call":
      const callpairs = e.arguments.map(a => flattenExprToVal(a, env));
      const callinits = callpairs.map(cp => cp[0]).flat();
      const callstmts = callpairs.map(cp => cp[1]).flat();
      const callvals = callpairs.map(cp => cp[2]).flat();
      return [ callinits, callstmts,
        {
          ...e,
          arguments: callvals
        }
      ];
    case "method-call": {
      const [objinits, objstmts, objval] = flattenExprToVal(e.obj, env);
      const argpairs = e.arguments.map(a => flattenExprToVal(a, env));
      const arginits = argpairs.map(cp => cp[0]).flat();
      const argstmts = argpairs.map(cp => cp[1]).flat();
      const argvals = argpairs.map(cp => cp[2]).flat();
      var objTyp = e.obj.a;
      if(objTyp.tag !== "class") { // I don't think this error can happen
        throw new Error("Report this as a bug to the compiler developer, this shouldn't happen " + objTyp.tag);
      }
      const className = objTyp.name;
      const checkObj : IR.Stmt<Type> = { tag: "expr", expr: { tag: "call", name: `assert_not_none`, arguments: [objval]}}
      const callMethod : IR.Expr<Type> = { tag: "call", name: `${className}$${e.method}`, arguments: [objval, ...argvals] }
      return [
        [...objinits, ...arginits],
        [...objstmts, checkObj, ...argstmts],
        callMethod
      ];
    }
    case "lookup": {
      const [oinits, ostmts, oval] = flattenExprToVal(e.obj, env);
      if(e.obj.a.tag !== "class") { throw new Error("Compiler's cursed, go home"); }
      const classdata = env.classes.get(e.obj.a.name);
      const [offset, _] = classdata.get(e.field);
      return [oinits, ostmts, {
        tag: "load",
        start: oval,
        offset: { tag: "wasmint", value: offset }}];
    }
    case "index": {
      var [indexoinits, indexostmts, indexoval] = flattenExprToVal(e.obj, env);
      const [_3, _4, indexval] = flattenExprToVal(e.index, env)
      var index_offset: number = 0;
      if (indexval.tag == "num") 
       index_offset = Number(indexval.value) + 1

       const alloc_index_string : IR.Expr<Type> = { tag: "alloc", amount: { tag: "wasmint", value: 2 } };
       var assigns_index_string : IR.Stmt<Type>[] = [];
       const newIndexStrName = generateName("newStr"); 
       assigns_index_string.push({
         tag: "store",
         start: {tag: "id", name: newIndexStrName},
         offset: {tag:"wasmint", value: 0},
         value: {a:NUM , tag:"wasmint", value:1}
       });
        const ascii_index = "i".charCodeAt(0);
        assigns_index_string.push({
          tag: "store",
          start: {tag: "id", name: newIndexStrName},
          offset: {tag:"wasmint", value: 1},
          value: {a:NUM , tag:"wasmint", value:ascii_index}
        });
      
        indexoinits.push({ name: newIndexStrName, type: STRING, value: { tag: "none" } });
      
      return [indexoinits, 
        [...indexostmts, { tag: "assign", name: newIndexStrName, value: alloc_index_string }, ...assigns_index_string,], 
        {  tag: "value", value: { a: e.a, tag: "id", name: newIndexStrName } }];
    }

    case "construct":
      const classdata = env.classes.get(e.name);
      const fields = [...classdata.entries()];
      const newName = generateName("newObj");
      const alloc : IR.Expr<Type> = { tag: "alloc", amount: { tag: "wasmint", value: fields.length } };
      const assigns : IR.Stmt<Type>[] = fields.map(f => {
        const [_, [index, value]] = f;
        return {
          tag: "store",
          start: { tag: "id", name: newName },
          offset: { tag: "wasmint", value: index },
          value: value
        }
      });

      return [
        [ { name: newName, type: e.a, value: { tag: "none" } }],
        [ { tag: "assign", name: newName, value: alloc }, ...assigns,
          { tag: "expr", expr: { tag: "call", name: `${e.name}$__init__`, arguments: [{ a: e.a, tag: "id", name: newName }] } }
        ],
        { a: e.a, tag: "value", value: { a: e.a, tag: "id", name: newName } }
      ];
    // case "construct-string":
    //   const strLength = e.value.length;
    //   const alloc_string : IR.Expr<Type> = { tag: "alloc", amount: { tag: "wasmint", value: strLength } };
    //   var assigns_string : IR.Stmt<Type>[];
    //   const newStrName = generateName("newStr"); 
    //   for (var i=0; i<strLength;i++){
    //     const ascii = e.value.charCodeAt(i);
    //     assigns_string.push({
    //       tag: "store",
    //       start: {tag: "id", name: newStrName},
    //       offset: {tag:"wasmint", value: i},
    //       value: {a:NUM , tag:"wasmint", value:ascii}
    //     });
    //   }
    //   return [
    //     [ { name: newStrName, type: e.a, value: { tag: "str", value:e.value } }],
    //     [ { tag: "assign", name: newStrName, value: alloc_string }, ...assigns_string,
    //     //  { tag: "expr", expr: { tag: "call", name: `${e.name}$__init__`, arguments: [{ a: e.a, tag: "id", name: newName }] } }
    //     ],
    //     { a: e.a, tag: "value", value: { a: e.a, tag: "id", name: newStrName } }
    //   ];
    case "id":
      return [[], [], {tag: "value", value: { ...e }} ];
    case "literal":
      if (e.value.tag == "str") {
        let v = e.value;
        const strLength:number = v.value.length;
        const alloc_string : IR.Expr<Type> = { tag: "alloc", amount: { tag: "wasmint", value: strLength + 1 } };
        var assigns_string : IR.Stmt<Type>[] = [];
        const newStrName = generateName("newStr"); 
        console.log(strLength);
        assigns_string.push({
          tag: "store",
          start: {tag: "id", name: newStrName},
          offset: {tag:"wasmint", value: 0},
          value: {a:NUM , tag:"wasmint", value:strLength}
        });
        for (var i=1; i<=strLength;i++){
          const ascii = v.value.charCodeAt(i-1);
          assigns_string.push({
            tag: "store",
            start: {tag: "id", name: newStrName},
            offset: {tag:"wasmint", value: i},
            value: {a:NUM , tag:"wasmint", value:ascii}
          });
        }
        return [
          //[ { name: newStrName, type: e.a, value: { tag: "str", value: v.value } }],
          [ { name: newStrName, type: e.a, value: { tag: "none" } }],
          [ { tag: "assign", name: newStrName, value: alloc_string }, ...assigns_string,
          //  { tag: "expr", expr: { tag: "call", name: `${e.name}$__init__`, arguments: [{ a: e.a, tag: "id", name: newName }] } }
          ],
          {  tag: "value", value: { a: e.a, tag: "id", name: newStrName } }
        ];
      }
      return [[], [], {tag: "value", value: literalToVal(e.value) } ];
  }
}


function flattenExprToVal(e : AST.Expr<Type>, env : GlobalEnv) : [Array<IR.VarInit<Type>>, Array<IR.Stmt<Type>>, IR.Value<Type>] {
  var [binits, bstmts, bexpr] = flattenExprToExpr(e, env);
  if(bexpr.tag === "value") {
    return [binits, bstmts, bexpr.value];
  }
  else {
    var newName = generateName("valname");
    var setNewName : IR.Stmt<Type> = {
      tag: "assign",
      a: e.a,
      name: newName,
      value: bexpr 
    };
    // TODO: we have to add a new var init for the new variable we're creating here.
    // but what should the default value be?
    return [
      [...binits, { a: e.a, name: newName, type: e.a, value: { tag: "none" } }],
      [...bstmts, setNewName],  
      {tag: "id", name: newName, a: e.a}
    ];
  }
}

function pushStmtsToLastBlock(blocks: Array<IR.BasicBlock<Type>>, ...stmts: Array<IR.Stmt<Type>>) {
  blocks[blocks.length - 1].stmts.push(...stmts);
}