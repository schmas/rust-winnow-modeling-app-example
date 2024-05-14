import { Selection } from 'lib/selections'
import {
  Program,
  CallExpression,
  PipeExpression,
  VariableDeclaration,
  VariableDeclarator,
  Value,
  Literal,
  PipeSubstitution,
  Identifier,
  ArrayExpression,
  ObjectExpression,
  UnaryExpression,
  BinaryExpression,
  PathToNode,
  ProgramMemory,
} from './wasm'
import {
  findAllPreviousVariables,
  getNodeFromPath,
  getNodePathFromSourceRange,
  isNodeSafeToReplace,
} from './queryAst'
import { addTagForSketchOnFace } from './std/sketch'
import { isLiteralArrayOrStatic } from './std/sketchcombos'
import { DefaultPlaneStr } from 'clientSideScene/sceneEntities'
import { roundOff } from 'lib/utils'
import { KCL_DEFAULT_CONSTANT_PREFIXES } from 'lib/constants'

export function startSketchOnDefault(
  node: Program,
  axis: DefaultPlaneStr,
  name = ''
): { modifiedAst: Program; id: string; pathToNode: PathToNode } {
  const _node = { ...node }
  const _name =
    name || findUniqueName(node, KCL_DEFAULT_CONSTANT_PREFIXES.SKETCH)

  const startSketchOn = createCallExpressionStdLib('startSketchOn', [
    createLiteral(axis),
  ])

  const variableDeclaration = createVariableDeclaration(_name, startSketchOn)
  _node.body = [...node.body, variableDeclaration]
  const sketchIndex = _node.body.length - 1

  let pathToNode: PathToNode = [
    ['body', ''],
    [sketchIndex, 'index'],
    ['declarations', 'VariableDeclaration'],
    ['0', 'index'],
    ['init', 'VariableDeclarator'],
  ]

  return {
    modifiedAst: _node,
    id: _name,
    pathToNode,
  }
}

export function addStartProfileAt(
  node: Program,
  pathToNode: PathToNode,
  at: [number, number]
): { modifiedAst: Program; pathToNode: PathToNode } {
  const variableDeclaration = getNodeFromPath<VariableDeclaration>(
    node,
    pathToNode,
    'VariableDeclaration'
  ).node
  if (variableDeclaration.type !== 'VariableDeclaration') {
    throw new Error('variableDeclaration.init.type !== PipeExpression')
  }
  const _node = { ...node }
  const init = variableDeclaration.declarations[0].init
  const startProfileAt = createCallExpressionStdLib('startProfileAt', [
    createArrayExpression([
      createLiteral(roundOff(at[0])),
      createLiteral(roundOff(at[1])),
    ]),
    createPipeSubstitution(),
  ])
  if (init.type === 'PipeExpression') {
    init.body.splice(1, 0, startProfileAt)
  } else {
    variableDeclaration.declarations[0].init = createPipeExpression([
      init,
      startProfileAt,
    ])
  }
  return {
    modifiedAst: _node,
    pathToNode,
  }
}

export function addSketchTo(
  node: Program,
  axis: 'xy' | 'xz' | 'yz',
  name = ''
): { modifiedAst: Program; id: string; pathToNode: PathToNode } {
  const _node = { ...node }
  const _name =
    name || findUniqueName(node, KCL_DEFAULT_CONSTANT_PREFIXES.EXTRUDE)

  const startSketchOn = createCallExpressionStdLib('startSketchOn', [
    createLiteral(axis.toUpperCase()),
  ])
  const startProfileAt = createCallExpressionStdLib('startProfileAt', [
    createLiteral('default'),
    createPipeSubstitution(),
  ])
  const initialLineTo = createCallExpressionStdLib('line', [
    createLiteral('default'),
    createPipeSubstitution(),
  ])

  const pipeBody = [startSketchOn, startProfileAt, initialLineTo]

  const variableDeclaration = createVariableDeclaration(
    _name,
    createPipeExpression(pipeBody)
  )

  _node.body = [...node.body, variableDeclaration]
  let sketchIndex = _node.body.length - 1
  let pathToNode: PathToNode = [
    ['body', ''],
    [sketchIndex, 'index'],
    ['declarations', 'VariableDeclaration'],
    ['0', 'index'],
    ['init', 'VariableDeclarator'],
  ]
  if (axis !== 'xy') {
    pathToNode = [...pathToNode, ['body', ''], ['0', 'index']]
  }

  return {
    modifiedAst: _node,
    id: _name,
    pathToNode,
  }
}

export function findUniqueName(
  ast: Program | string,
  name: string,
  pad = 3,
  index = 1
): string {
  let searchStr: string = typeof ast === 'string' ? ast : JSON.stringify(ast)
  const indexStr = String(index).padStart(pad, '0')

  const endingDigitsMatcher = /\d+$/
  const nameEndsInDigits = name.match(endingDigitsMatcher)
  let nameIsInString = searchStr.includes(`:"${name}"`)

  if (nameEndsInDigits !== null) {
    // base case: name is unique and ends in digits
    if (!nameIsInString) return name

    // recursive case: name is not unique and ends in digits
    const newPad = nameEndsInDigits[1].length
    const newIndex = parseInt(nameEndsInDigits[1]) + 1
    const nameWithoutDigits = name.replace(endingDigitsMatcher, '')

    return findUniqueName(searchStr, nameWithoutDigits, newPad, newIndex)
  }

  const newName = `${name}${indexStr}`
  nameIsInString = searchStr.includes(`:"${newName}"`)

  // base case: name is unique and does not end in digits
  if (!nameIsInString) return newName

  // recursive case: name is not unique and does not end in digits
  return findUniqueName(searchStr, name, pad, index + 1)
}

export function mutateArrExp(
  node: Value,
  updateWith: ArrayExpression
): boolean {
  if (node.type === 'ArrayExpression') {
    node.elements.forEach((element, i) => {
      if (isLiteralArrayOrStatic(element)) {
        node.elements[i] = updateWith.elements[i]
      }
    })
    return true
  }
  return false
}

export function mutateObjExpProp(
  node: Value,
  updateWith: Literal | ArrayExpression,
  key: string
): boolean {
  if (node.type === 'ObjectExpression') {
    const keyIndex = node.properties.findIndex((a) => a.key.name === key)
    if (keyIndex !== -1) {
      if (
        isLiteralArrayOrStatic(updateWith) &&
        isLiteralArrayOrStatic(node.properties[keyIndex].value)
      ) {
        node.properties[keyIndex].value = updateWith
        return true
      } else if (
        node.properties[keyIndex].value.type === 'ArrayExpression' &&
        updateWith.type === 'ArrayExpression'
      ) {
        const arrExp = node.properties[keyIndex].value as ArrayExpression
        arrExp.elements.forEach((element, i) => {
          if (isLiteralArrayOrStatic(element)) {
            arrExp.elements[i] = updateWith.elements[i]
          }
        })
      }
      return true
    } else {
      node.properties.push({
        type: 'ObjectProperty',
        key: createIdentifier(key),
        value: updateWith,
        start: 0,
        end: 0,
      })
    }
  }
  return false
}

export function extrudeSketch(
  node: Program,
  pathToNode: PathToNode,
  shouldPipe = false,
  distance = createLiteral(4) as Value
): {
  modifiedAst: Program
  pathToNode: PathToNode
  pathToExtrudeArg: PathToNode
} {
  const _node = { ...node }
  const { node: sketchExpression } = getNodeFromPath(
    _node,
    pathToNode,
    'SketchExpression' // TODO fix this #25
  )

  // determine if sketchExpression is in a pipeExpression or not
  const { node: pipeExpression } = getNodeFromPath<PipeExpression>(
    _node,
    pathToNode,
    'PipeExpression'
  )
  const isInPipeExpression = pipeExpression.type === 'PipeExpression'

  const { node: variableDeclarator, shallowPath: pathToDecleration } =
    getNodeFromPath<VariableDeclarator>(_node, pathToNode, 'VariableDeclarator')

  const extrudeCall = createCallExpressionStdLib('extrude', [
    distance,
    shouldPipe
      ? createPipeSubstitution()
      : createIdentifier(variableDeclarator.id.name),
  ])

  if (shouldPipe) {
    const pipeChain = createPipeExpression(
      isInPipeExpression
        ? [...pipeExpression.body, extrudeCall]
        : [sketchExpression as any, extrudeCall]
    )

    variableDeclarator.init = pipeChain
    const pathToExtrudeArg: PathToNode = [
      ...pathToDecleration,
      ['init', 'VariableDeclarator'],
      ['body', ''],
      [pipeChain.body.length - 1, 'index'],
      ['arguments', 'CallExpression'],
      [0, 'index'],
    ]

    return {
      modifiedAst: _node,
      pathToNode,
      pathToExtrudeArg,
    }
  }

  // We're not creating a pipe expression,
  // but rather a separate constant for the extrusion
  const name = findUniqueName(node, KCL_DEFAULT_CONSTANT_PREFIXES.EXTRUDE)
  const VariableDeclaration = createVariableDeclaration(name, extrudeCall)

  const sketchIndexInPathToNode =
    pathToDecleration.findIndex((a) => a[0] === 'body') + 1
  const sketchIndexInBody = pathToDecleration[
    sketchIndexInPathToNode
  ][0] as number
  _node.body.splice(sketchIndexInBody + 1, 0, VariableDeclaration)
  console.log('extruding', {
    VariableDeclaration,
    extrudeCall,
    body: _node.body,
    pathToDecleration,
    sketchIndexInBody,
    sketchIndexInPathToNode,
  })
  const pathToExtrudeArg: PathToNode = [
    ['body', ''],
    [sketchIndexInBody + 1, 'index'],
    ['declarations', 'VariableDeclaration'],
    [0, 'index'],
    ['init', 'VariableDeclarator'],
    ['arguments', 'CallExpression'],
    [0, 'index'],
  ]
  return {
    modifiedAst: _node,
    pathToNode: [...pathToNode.slice(0, -1), [-1, 'index']],
    pathToExtrudeArg,
  }
}

export function sketchOnExtrudedFace(
  node: Program,
  pathToNode: PathToNode,
  programMemory: ProgramMemory,
  cap: 'none' | 'start' | 'end' = 'none'
): { modifiedAst: Program; pathToNode: PathToNode } {
  let _node = { ...node }
  const newSketchName = findUniqueName(
    node,
    KCL_DEFAULT_CONSTANT_PREFIXES.SKETCH
  )
  const { node: oldSketchNode } = getNodeFromPath<VariableDeclarator>(
    _node,
    pathToNode,
    'VariableDeclarator',
    true
  )
  const oldSketchName = oldSketchNode.id.name
  const { node: expression } = getNodeFromPath<CallExpression>(
    _node,
    pathToNode,
    'CallExpression'
  )

  let _tag = ''
  if (cap === 'none') {
    const { modifiedAst, tag } = addTagForSketchOnFace(
      {
        previousProgramMemory: programMemory,
        pathToNode,
        node: _node,
      },
      expression.callee.name
    )
    _tag = tag
    _node = modifiedAst
  } else {
    _tag = cap.toUpperCase()
  }

  const newSketch = createVariableDeclaration(
    newSketchName,
    createCallExpressionStdLib('startSketchOn', [
      createIdentifier(oldSketchName),
      createLiteral(_tag),
    ]),
    'const'
  )

  const expressionIndex = pathToNode[1][0] as number
  _node.body.splice(expressionIndex + 1, 0, newSketch)
  const newpathToNode: PathToNode = [
    ['body', ''],
    [expressionIndex + 1, 'index'],
    ['declarations', 'VariableDeclaration'],
    [0, 'index'],
    ['init', 'VariableDeclarator'],
  ]

  return {
    modifiedAst: _node,
    pathToNode: newpathToNode,
  }
}

export const getLastIndex = (pathToNode: PathToNode): number =>
  splitPathAtLastIndex(pathToNode).index

export function splitPathAtLastIndex(pathToNode: PathToNode): {
  path: PathToNode
  index: number
} {
  const last = pathToNode[pathToNode.length - 1]
  if (last && typeof last[0] === 'number') {
    return {
      path: pathToNode.slice(0, -1),
      index: last[0],
    }
  } else if (pathToNode.length === 0) {
    return {
      path: [],
      index: -1,
    }
  }
  return splitPathAtLastIndex(pathToNode.slice(0, -1))
}

export function splitPathAtPipeExpression(pathToNode: PathToNode): {
  path: PathToNode
  index: number
} {
  const last = pathToNode[pathToNode.length - 1]

  if (
    last &&
    last[1] === 'index' &&
    pathToNode?.[pathToNode.length - 2]?.[1] === 'PipeExpression' &&
    typeof last[0] === 'number'
  ) {
    return {
      path: pathToNode.slice(0, -1),
      index: last[0],
    }
  } else if (pathToNode.length === 0) {
    return {
      path: [],
      index: -1,
    }
  }

  return splitPathAtPipeExpression(pathToNode.slice(0, -1))
}

export function createLiteral(value: string | number): Literal {
  return {
    type: 'Literal',
    start: 0,
    end: 0,
    value,
    raw: `${value}`,
  }
}

export function createIdentifier(name: string): Identifier {
  return {
    type: 'Identifier',
    start: 0,
    end: 0,
    name,
  }
}

export function createPipeSubstitution(): PipeSubstitution {
  return {
    type: 'PipeSubstitution',
    start: 0,
    end: 0,
  }
}

export function createCallExpressionStdLib(
  name: string,
  args: CallExpression['arguments']
): CallExpression {
  return {
    type: 'CallExpression',
    start: 0,
    end: 0,
    callee: {
      type: 'Identifier',
      start: 0,
      end: 0,
      name,
    },
    optional: false,
    arguments: args,
  }
}

export function createCallExpression(
  name: string,
  args: CallExpression['arguments']
): CallExpression {
  return {
    type: 'CallExpression',
    start: 0,
    end: 0,
    callee: {
      type: 'Identifier',
      start: 0,
      end: 0,
      name,
    },
    optional: false,
    arguments: args,
  }
}

export function createArrayExpression(
  elements: ArrayExpression['elements']
): ArrayExpression {
  return {
    type: 'ArrayExpression',
    start: 0,
    end: 0,
    elements,
  }
}

export function createPipeExpression(
  body: PipeExpression['body']
): PipeExpression {
  return {
    type: 'PipeExpression',
    start: 0,
    end: 0,
    body,
    nonCodeMeta: { nonCodeNodes: {}, start: [] },
  }
}

export function createVariableDeclaration(
  varName: string,
  init: VariableDeclarator['init'],
  kind: VariableDeclaration['kind'] = 'const'
): VariableDeclaration {
  return {
    type: 'VariableDeclaration',
    start: 0,
    end: 0,
    declarations: [
      {
        type: 'VariableDeclarator',
        start: 0,
        end: 0,
        id: createIdentifier(varName),
        init,
      },
    ],
    kind,
  }
}

export function createObjectExpression(properties: {
  [key: string]: Value
}): ObjectExpression {
  return {
    type: 'ObjectExpression',
    start: 0,
    end: 0,
    properties: Object.entries(properties).map(([key, value]) => ({
      type: 'ObjectProperty',
      start: 0,
      end: 0,
      key: createIdentifier(key),
      value,
    })),
  }
}

export function createUnaryExpression(
  argument: UnaryExpression['argument'],
  operator: UnaryExpression['operator'] = '-'
): UnaryExpression {
  return {
    type: 'UnaryExpression',
    start: 0,
    end: 0,
    operator,
    argument,
  }
}

export function createBinaryExpression([left, operator, right]: [
  BinaryExpression['left'],
  BinaryExpression['operator'],
  BinaryExpression['right']
]): BinaryExpression {
  return {
    type: 'BinaryExpression',
    start: 0,
    end: 0,
    operator,
    left,
    right,
  }
}

export function createBinaryExpressionWithUnary([left, right]: [
  BinaryExpression['left'],
  BinaryExpression['right']
]): BinaryExpression {
  if (right.type === 'UnaryExpression' && right.operator === '-')
    return createBinaryExpression([left, '-', right.argument])
  return createBinaryExpression([left, '+', right])
}

export function giveSketchFnCallTag(
  ast: Program,
  range: Selection['range'],
  tag?: string
): {
  modifiedAst: Program
  tag: string
  isTagExisting: boolean
  pathToNode: PathToNode
} {
  const path = getNodePathFromSourceRange(ast, range)
  const { node: primaryCallExp } = getNodeFromPath<CallExpression>(
    ast,
    path,
    'CallExpression'
  )
  // Tag is always 3rd expression now, using arg index feels brittle
  // but we can come up with a better way to identify tag later.
  const thirdArg = primaryCallExp.arguments?.[2]
  const tagLiteral =
    thirdArg || (createLiteral(tag || findUniqueName(ast, 'seg', 2)) as Literal)
  const isTagExisting = !!thirdArg
  if (!isTagExisting) {
    primaryCallExp.arguments[2] = tagLiteral
  }
  if ('value' in tagLiteral) {
    // Now TypeScript knows tagLiteral has a value property
    return {
      modifiedAst: ast,
      tag: String(tagLiteral.value),
      isTagExisting,
      pathToNode: path,
    }
  } else {
    throw new Error('Unable to assign tag without value')
  }
}

export function moveValueIntoNewVariable(
  ast: Program,
  programMemory: ProgramMemory,
  sourceRange: Selection['range'],
  variableName: string
): {
  modifiedAst: Program
} {
  const { isSafe, value, replacer } = isNodeSafeToReplace(ast, sourceRange)
  if (!isSafe || value.type === 'Identifier') return { modifiedAst: ast }

  const { insertIndex } = findAllPreviousVariables(
    ast,
    programMemory,
    sourceRange
  )
  let _node = JSON.parse(JSON.stringify(ast))
  _node = replacer(_node, variableName).modifiedAst
  _node.body.splice(
    insertIndex,
    0,
    createVariableDeclaration(variableName, value)
  )
  return { modifiedAst: _node }
}
