import { PathToNode, VariableDeclarator } from 'lang/wasm'
import { engineCommandManager } from 'lang/std/engineConnection'
import {
  Axis,
  Selection,
  SelectionRangeTypeMap,
  Selections,
} from 'lib/selections'
import { assign, createMachine } from 'xstate'
import { isCursorInSketchCommandRange } from 'lang/util'
import { getNodePathFromSourceRange } from 'lang/queryAst'
import { kclManager } from 'lang/KclSingleton'
import {
  horzVertInfo,
  applyConstraintHorzVert,
} from 'components/Toolbar/HorzVert'
import {
  applyConstraintHorzVertAlign,
  horzVertDistanceInfo,
} from 'components/Toolbar/SetHorzVertDistance'
import { angleBetweenInfo } from 'components/Toolbar/SetAngleBetween'
import { angleLengthInfo } from 'components/Toolbar/setAngleLength'
import {
  applyConstraintEqualLength,
  setEqualLengthInfo,
} from 'components/Toolbar/EqualLength'
import { addStartProfileAt, extrudeSketch } from 'lang/modifyAst'
import { getNodeFromPath } from '../lang/queryAst'
import { CallExpression, PipeExpression } from '../lang/wasm'
import {
  applyConstraintEqualAngle,
  equalAngleInfo,
} from 'components/Toolbar/EqualAngle'
import {
  applyRemoveConstrainingValues,
  removeConstrainingValuesInfo,
} from 'components/Toolbar/RemoveConstrainingValues'
import { intersectInfo } from 'components/Toolbar/Intersect'
import {
  absDistanceInfo,
  applyConstraintAxisAlign,
} from 'components/Toolbar/SetAbsDistance'
import { Models } from '@kittycad/lib/dist/types/src'
import { ModelingCommandSchema } from 'lib/commandBarConfigs/modelingCommandConfig'
import {
  DefaultPlaneStr,
  sceneEntitiesManager,
  quaternionFromSketchGroup,
  sketchGroupFromPathToNode,
} from 'clientSideScene/sceneEntities'
import { sceneInfra } from 'clientSideScene/sceneInfra'

export const MODELING_PERSIST_KEY = 'MODELING_PERSIST_KEY'

export type SetSelections =
  | {
      selectionType: 'singleCodeCursor'
      selection?: Selection
    }
  | {
      selectionType: 'otherSelection'
      selection: Axis
    }
  | {
      selectionType: 'completeSelection'
      selection: Selections
    }
  | {
      selectionType: 'mirrorCodeMirrorSelections'
      selection: Selections
    }

export type ModelingMachineEvent =
  | {
      type: 'Enter sketch'
      data?: {
        forceNewSketch?: boolean
      }
    }
  | {
      type: 'Select default plane'
      data: { plane: DefaultPlaneStr; normal: [number, number, number] }
    }
  | { type: 'Set selection'; data: SetSelections }
  | { type: 'Sketch no face' }
  | { type: 'Toggle gui mode' }
  | { type: 'Cancel' }
  | { type: 'CancelSketch' }
  | { type: 'Add start point' }
  | { type: 'Make segment horizontal' }
  | { type: 'Make segment vertical' }
  | { type: 'Constrain horizontal distance' }
  | { type: 'Constrain ABS X' }
  | { type: 'Constrain ABS Y' }
  | { type: 'Constrain vertical distance' }
  | { type: 'Constrain angle' }
  | { type: 'Constrain perpendicular distance' }
  | { type: 'Constrain horizontally align' }
  | { type: 'Constrain vertically align' }
  | { type: 'Constrain snap to X' }
  | { type: 'Constrain snap to Y' }
  | { type: 'Constrain length' }
  | { type: 'Constrain equal length' }
  | { type: 'Constrain parallel' }
  | { type: 'Constrain remove constraints' }
  | { type: 'Re-execute' }
  | { type: 'Extrude'; data?: ModelingCommandSchema['Extrude'] }
  | { type: 'Extrude 2' }
  | { type: 'set extrude distance'; data: number }
  | { type: 'Equip Line tool' }
  | { type: 'Equip tangential arc to' }
  | {
      type: 'done.invoke.animate-to-face'
      data: {
        sketchPathToNode: PathToNode
        sketchNormalBackUp: [number, number, number] | null
      }
    }

export type MoveDesc = { line: number; snippet: string }

export const modelingMachine = createMachine(
  {
    /** @xstate-layout N4IgpgJg5mDOIC5QFkD2EwBsCWA7KAxAMICGuAxlgNoAMAuoqAA6qzYAu2qujIAHogC0AdgCsAZgB04gEyjhADnEA2GgoUAWJQBoQAT0QBGGuICckmoZkbTM42YWKAvk91oMOfAQDKYdgAJYLDByTm5aBiQQFjYwniiBBFtpGhlxDRphGg1ZURlhXQMEcRLDSVF5UwV84XEK8Rc3dCw8KElsCEwwHz9A4NCuXAjeGI5B3kTBDOFJYWVlQ2UlY3UrQsQFUQVy0Q00w3FLGVNTBtcQdxb8ds7ugFFcdjAAJ0CAaz9yAAthqNG4iZCdKiWZpcQKEyHTKmTLrYrCGb5DRaGHKBGiYzKRoXZqeNodLoEB5PV6wD7sb5UQyRZisMbcQEIQRLGiSdRmfIqUxLCpw5QqcrQ4SGTTWUx5bGXPE3Ql3PjsZ4AVwwv1psXGCSEMjkkhkNFE-MNBxo4vEcM22wqOQxikMKwUktxrRl93lSow-hkquidIBmoQCmUkhhWhUgZN6js5tMZXym0MYgy+sMjo8zu85O+xDIlEwGc+P3oI19GtAiTtgckxmEyIhELMsjhFbKFYUdsOIq2qaubXzFK+kj73wAkrcegEgl0BuEi38Swz-YY9lJ+aJTDYFltrGb9EYTDILDQlnNwTQTNzu9KhwPr6PCcgSB8+lAALZgR7+ABuL045BImG9f5S34IxjhbapNDmTRUgKXcECXA4UjPOQJDjdJL3TTMbywu9ugfJ8glfd8Ai+VBnmwAAvbh2H-QD53iMtQJrSRVHDDErDmYQZCbcQ7XKDR5EsfljAqGQMOua9BxwsciG4WAFRIPB-FI8iqMef9-AgbB5JzMA6PVBdGPguQNAsZcI3SGN1DhNJuQsCpRDPASYwOcTeywqSC1w4g5IUpTv2eX8NK0nSKD02c1XpBiQOMpZgzyeNlA0FY9hszlymsEUNARLjlF2NzPP7QqRxk3znkU3B-AAQQAIW8fwAA19KixkrE2SQcjEJdTisWwdyKY5dnitEIVSNdajOJo0wkjzb1K3B5PKpTavqgBNZq-SMtqQWsOxlDkQwDQNbi4MOdRQQcxY1BrDQCskubCVkha-MqsgoC6DbgPLdIpHBcEZE2W1hFMGzHMRLZ5HRNETmEO7Zukx6yoq-wunwdhCxpH0DOi77xBmFQDRNA59lEGyFm2OZ1wTddQzROGC2Kr5vKexbkaYF52dwLTyEVTASFeEKaLCz7DJiqwAY6k5eOsSxw2UGy21M4UqlMBFrGRMR6aKh7uhZl7lLIyjqP-TA9H8f9sCgIYIqxlrFxkfa2S2LQJAEjJ+SbDEg0GyCuLEflJpxab3IZnWfOepbKoCoLMFN82cCtkWcaY8wcgB4GvbMDEm32kEtlVqolmORxA6lTDQ4R3WkaU2BcBIJh-HYVBGqT1reKkB3TwUVXqjMGzsgPbUDXmVQti4sTzjLmaK68+bWZruuG6b-x1ptoDRe+xDMmEhE8eMDQbKXGZdkcOQYxrJLS6daftcr8P58qsAAEdFQ01GoHR1v7dOcoj+BrI8gSFgkUBMhwOqHChPqPKyhTBa2+IzZm1dKpMH5ibaga96Jt3yBYbUwk1zpATAfOChhTgzEhIsEhMIsibDgdhWeiMI7I2eGAF8qBvz+HIEg9gsAv5bWsNsBY1hjqaEOjoYhywLCLFsNkEoah9q0IQWOAASmAQQYA+AhEVE8XhYs6hSAOCQw4aRsoVEMOaao0gMgOzmPMJQCwFFhzuC-bADcAAyeAwCN1QKgACGDsatVRIKeotgxBiKKLlDqORxZqFSDArEk9r4h1vvQ+4zil5vWItgDS-NyBeJ0YkPa2xwQGl4nlRQeimzGDKFBUe5TkRJQUVVAA7opEihs1I0UwJpbSQtKD+DwAAM1QAQCA3AwDtFwJ+VAHxJAwHYIIFSRt1KYEEIM1A+TEBpGyJEpKJpagw1qDZZK5hNgA32DAuQdMEnB0ZpIZprSDaqWNl0wWul+m4CGQQF4zwyKSCYHzdgQzngvlmX4BZ7TnmrI+esvxdsjJbJBHaZE7YBIA1VjZf6ZkjxnjqPkex1yey3PuRwL8P5sB-heT0t5ayRljImVMmZczBDR3Jf+KFQyNkIH2AeA4toTBohIfkNKSg2RiDkHYUoXFGktJJSyil3TQp9Jpd835-ySCArIiCplcq2VrM5dytk+oxDn2dmlPYVZoGpHBBBJQ0qHkrUau8z5ozcDjLwAy8ZTKSAACNYCCD4OymFmN17Jy5aU2Y+1kJyDqAoGy3IeUZGSpfB2nI7UkodQ1J1wyVXPD+QCoFWqwU+r9QGvVsLNoxX2DMHI1q6gwhPnGxY0gth5V4tkGssCCVXg8sSgIDrVpZtpa6+l0zPVFt9YIPQgb9XhrqPICothSECThIcNEktu6OS2IcfKXby5FV7dVOqK9B05rzeqgtoL5nFsndO8tX1Nm8TIXivGDt+RJpXYsUyR5uT7QOi+tNAQ3pdEHS6t1kzR2XsEEB1RZbg2YP9FWlI7ZAEnGznBFCQZTj6ksIdFtCIAPm3wMB5Vzwfm5rVRq4FkHoO3rg-4hDvEKbZDalYNQ59QYJirAcQSch9TWII+-dGIG6Xuog0ywTXxaPFno-C3iII05mGSjWPUQr0M8gsAHUBCxhQTymoSySB6JMntI6q-NmrIMSak3OGTlbw3GBMFsRYkEToDSSgeeY-D1xiChgR9mzxObc15vzBVvTPE0tAyOxlYK-MBfJUF54ghXlhSs5FCtBSU3xSUNYX9RdSboeqCCPeGh5hrnFNG3zHN3yBb5gLKlYVjNkbPZRwt8yYtVbizVxLdXKApdtmlzZGXxRZeK7ggrNkcrSGFMVvKqHyu7pvvA9xrqvE+PHH0KccR9V6lTqxkUmROxpDjTMEhWwTT8NYrpoO+mPJLc8U3VbTjFQuMbhkx4WSuk5LyXejemyESmUOmYM86gVbyzgqratJRFAIhNPEvT3aGa3ZW5gSQw5cAcAIFtiQ0hV0Qk7NlPGfJhQsW7sDRW+pHApnm0kxbHikco7R+wDH1JpNwsrQDbYJwbCKEcrIOxcJKbBiXA4OtMCJAKMR-d5HuBNX-jW5OEIm3vuhv4RztcuxhQk8DPzmEzbBUwJw3aTtcO900+W5LyQAA5ZuAAFVAeBuEECqhACAgQaKBX8Cwe3+r5imXrTNvYEIkp8hgeAguWRFBKAdFT25EvvHI6t-4W39vYDZjCr4ujrP0smklmIQ4USsj9UQKcA8bYe7JTSA7KoCjUfo85VUoMLsC+j220QkBYIOpon2qoVQDtkrV4Z0zjP-X4LJjZDCEM-I9SWFb6BGMsxNjpEEUlU4sOrvw6KgAFVe5wbJzxclNzl-0RXQ-71cv2uYGBShTRneOE2TKbJP1T6XBUKPxuFsDi3-gTJu-9-DMe892PHxb3ZEcBTITYcUI8FzIvYrWYceOoLII8YrWGaPSSRULmZuHSQKa8AAeVwCHTAw9TuW8A30EDQNGUEEwPYBwOthPx+3gihHihugxG1AhDyyKGdlgNrH2jbHVkpzf2py+H8Gl38AGRIEoB6A200jAFEN5gCDVVdU5UEG6mkE2AcztBrAkBIT5B1HXG5CXFUCsAqGQP4MkDIGwBfHVVaC8Q9z5ldXwMi3GTMIsKeEECbkEFEMoE5VMSrAhEUGyCjVhDgm4OkCsFkTRRrHUAKicMsPwGsPkO6F8AnCP0GH1S4i43FTXFYhrDhBPirDqH2ns0n3w2j2iM4FiOXnUR6SsLJALHsNExmVKNUTcJqP7C8LyhYg4jMFsG1DxmAUQGSkKwSkQLsBG00AKjuC0jKKgH8DlAVGVG6CCACHUTmI9CS08KV1aj1AsBjWNEDDtH0Lv0yHKHAIrG5BKGRHGMmKsNmPdFdBWPCloNDUEG1HMEYwyFEnBC0ECJAXPGJwEggR4NF0uLGFiJuPmMPw2xSI2P9D2AbxDAbGlhyFBx+MUF1AgmYIIQWHiXOGlwwHgCiCnigBZ2H0EFx2kDkHKVYk0DCSECGghD2H3FiQjEu0JJdGJNP2ZC0HKGhlqE0Gdj6IDDbHKDOgB1CMsCNzXxNy+HZLoO5G2Eb35T4xNBn2KHcyGzUGF2yCWAcUrhlNDQOBOF1CSjbDxgKzqEqWSAODxlSGqBjDtII0WQ6WCm6zC2hT1NakDHlIyB7h02hygLDWSGBChHmBCT4MlPfzuRlQCB1UpUVVdKGXdMXEjAtTPG4xUDAjSkchwWSkVhKwxAIwzSzUTK2m7ikA1N6nTPsxBnQx6g6gNEUAMNHmqALKPQHTWWLLFm7gPASiiXpP9NXR2hQnnSqFtII2gyLOs0zyMA3RYihBrSqDyFOFBjUDZDSE2EJjmDSFEAE3fA-kEPbMnOHxFB1wyHyMcxX3mDJgFGBhIUcGhgEn5Aq383ax5hqxC2pTdMPNP07CDGBjyjUETTOMLy5VtFmFvLXFwz-PF1p0lw7IKXsAsAmk2BsHUCWByKFNOCqFvK8z2AlNZMkkAORxr3YDgs2UOjKEyBKGQpHLQqCMtPmHSGK0B2KzwsSRjxgrj0kGl2BX-FIq5S5w6l3mOBiVkH9KyDKA3EMWlkDFkGgrN04oTyT0eHxNS1P1fURFOFkCXCTD-P5wRDZH+g+OsWbJQI8mIr4pEgvzdhlj+hjBVObC41WGNE7Ff3DIEMkE-xgDex-y8T4rkE0FgM7m4MqGrJ+LyCNMDB5AAUMIUTIIwLdyoKwlwIsu0w6j1AWF5VCJyK2BYiBxUBKxyH1FoSEObg8LAD4qmB1FdhIVUHgPjW0PkztAc31FDABiiLR2cKsOXniJSqkFVn1xsHkFY2RMQC722PUDmBPjOmMLctMI6piOmIqL4CqNiJaO+AsscF1ARHDDxnjQOBXTmEFHsF8OyjAlumjwmJBOmLBIwD4oNGDDMGBiwtFApybEsCkG7jtGhiqUUE7RcCAA */
    id: 'Modeling',

    tsTypes: {} as import('./modelingMachine.typegen').Typegen0,
    predictableActionArguments: true,
    preserveActionOrder: true,

    context: {
      guiMode: 'default',
      tool: null as Models['SceneToolType_type'] | null,
      selection: [] as string[],
      selectionRanges: {
        otherSelections: [],
        codeBasedSelections: [],
      } as Selections,
      selectionRangeTypeMap: {} as SelectionRangeTypeMap,
      sketchPathToNode: null as PathToNode | null, // maybe too specific, and we should have a generic pathToNode, but being specific seems less risky when I'm not sure
      sketchEnginePathId: '' as string,
      sketchPlaneId: '' as string,
      sketchNormalBackUp: null as null | [number, number, number],
      moveDescs: [] as MoveDesc[],
      extrudeDistance: 5 as number,
    },

    schema: {
      events: {} as ModelingMachineEvent,
    },

    states: {
      idle: {
        on: {
          'Set selection': {
            target: 'idle',
            internal: true,
            actions: 'Set selection',
          },

          'Enter sketch': [
            {
              target: 'animating to existing sketch',
              cond: 'Selection is on face',
              actions: ['set sketch metadata'],
            },
            'Sketch no face',
          ],

          Extrude: {
            target: 'idle',
            cond: 'has valid extrude selection',
            actions: ['AST extrude'],
            internal: true,
          },

          'Extrude 2': {
            target: 'Editing Extrude',
            cond: 'has valid extrude selection',
            actions: 'set extrude meta',
          },
        },

        entry: 'reset client scene mouse handlers',
      },

      Sketch: {
        states: {
          SketchIdle: {
            on: {
              'Set selection': {
                target: 'SketchIdle',
                internal: true,
                actions: 'Set selection',
              },

              'Make segment vertical': {
                cond: 'Can make selection vertical',
                target: 'SketchIdle',
                internal: true,
                actions: ['Make selection vertical'],
              },

              'Make segment horizontal': {
                target: 'SketchIdle',
                internal: true,
                cond: 'Can make selection horizontal',
                actions: ['Make selection horizontal'],
              },

              'Constrain horizontal distance': {
                target: 'Await horizontal distance info',
                cond: 'Can constrain horizontal distance',
              },

              'Constrain vertical distance': {
                target: 'Await vertical distance info',
                cond: 'Can constrain vertical distance',
              },

              'Constrain ABS X': {
                target: 'Await ABS X info',
                cond: 'Can constrain ABS X',
              },

              'Constrain ABS Y': {
                target: 'Await ABS Y info',
                cond: 'Can constrain ABS Y',
              },

              'Constrain angle': {
                target: 'Await angle info',
                cond: 'Can constrain angle',
              },

              'Constrain length': {
                target: 'Await length info',
                cond: 'Can constrain length',
              },

              'Constrain perpendicular distance': {
                target: 'Await perpendicular distance info',
                cond: 'Can constrain perpendicular distance',
              },

              'Constrain horizontally align': {
                cond: 'Can constrain horizontally align',
                target: 'SketchIdle',
                internal: true,
                actions: ['Constrain horizontally align'],
              },

              'Constrain vertically align': {
                cond: 'Can constrain vertically align',
                target: 'SketchIdle',
                internal: true,
                actions: ['Constrain vertically align'],
              },

              'Constrain snap to X': {
                cond: 'Can constrain snap to X',
                target: 'SketchIdle',
                internal: true,
                actions: ['Constrain snap to X'],
              },

              'Constrain snap to Y': {
                cond: 'Can constrain snap to Y',
                target: 'SketchIdle',
                internal: true,
                actions: ['Constrain snap to Y'],
              },

              'Constrain equal length': {
                cond: 'Can constrain equal length',
                target: 'SketchIdle',
                internal: true,
                actions: ['Constrain equal length'],
              },

              'Constrain parallel': {
                target: 'SketchIdle',
                internal: true,
                cond: 'Can canstrain parallel',
                actions: ['Constrain parallel'],
              },

              'Constrain remove constraints': {
                target: 'SketchIdle',
                internal: true,
                cond: 'Can constrain remove constraints',
                actions: ['Constrain remove constraints'],
              },

              'Re-execute': {
                target: 'SketchIdle',
                internal: true,
                actions: ['set sketchMetadata from pathToNode'],
              },

              'Equip Line tool': 'Line tool',

              'Equip tangential arc to': {
                target: 'Tangential arc to',
                cond: 'is editing existing sketch',
              },
            },

            entry: 'setup client side sketch segments',
          },

          'Await horizontal distance info': {
            invoke: {
              src: 'Get horizontal info',
              id: 'get-horizontal-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await vertical distance info': {
            invoke: {
              src: 'Get vertical info',
              id: 'get-vertical-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await ABS X info': {
            invoke: {
              src: 'Get ABS X info',
              id: 'get-abs-x-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await ABS Y info': {
            invoke: {
              src: 'Get ABS Y info',
              id: 'get-abs-y-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await angle info': {
            invoke: {
              src: 'Get angle info',
              id: 'get-angle-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await length info': {
            invoke: {
              src: 'Get length info',
              id: 'get-length-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Await perpendicular distance info': {
            invoke: {
              src: 'Get perpendicular distance info',
              id: 'get-perpendicular-distance-info',
              onDone: {
                target: 'SketchIdle',
                actions: 'Set selection',
              },
              onError: 'SketchIdle',
            },
          },

          'Line tool': {
            exit: [],

            on: {
              'Set selection': {
                target: 'Line tool',
                description: `This is just here to stop one of the higher level "Set selections" firing when we are just trying to set the IDE code without triggering a full engine-execute`,
                internal: true,
              },

              'Equip tangential arc to': {
                target: 'Tangential arc to',
                cond: 'is editing existing sketch',
              },
            },

            states: {
              Init: {
                always: [
                  {
                    target: 'normal',
                    cond: 'is editing existing sketch',
                    actions: 'set up draft line',
                  },
                  'No Points',
                ],
              },

              normal: {
                on: {
                  'Set selection': {
                    target: 'normal',
                    internal: true,
                  },
                },
              },

              'No Points': {
                entry: 'setup noPoints onClick listener',

                on: {
                  'Add start point': {
                    target: 'normal',
                    actions: 'set up draft line without teardown',
                  },

                  Cancel: '#Modeling.Sketch.undo startSketchOn',
                },
              },
            },

            initial: 'Init',
          },

          Init: {
            always: [
              {
                target: 'SketchIdle',
                cond: 'is editing existing sketch',
              },
              'Line tool',
            ],
          },

          'Tangential arc to': {
            entry: 'set up draft arc',

            on: {
              'Set selection': {
                target: 'Tangential arc to',
                internal: true,
              },

              'Equip Line tool': 'Line tool',
            },
          },

          'undo startSketchOn': {
            invoke: {
              src: 'AST-undo-startSketchOn',
              id: 'AST-undo-startSketchOn',
              onDone: '#Modeling.idle',
            },
          },
        },

        initial: 'Init',

        on: {
          CancelSketch: '.SketchIdle',
        },

        exit: [
          'sketch exit execute',
          'animate after sketch',
          'tear down client sketch',
          'remove sketch grid',
        ],

        entry: ['add axis n grid', 'conditionally equip line tool'],
      },

      'Sketch no face': {
        entry: 'show default planes',

        exit: 'hide default planes',
        on: {
          'Select default plane': {
            target: 'animating to plane',
            actions: ['reset sketch metadata'],
          },
        },
      },

      'animating to plane': {
        invoke: {
          src: 'animate-to-face',
          id: 'animate-to-face',
          onDone: {
            target: 'Sketch',
            actions: 'set new sketch metadata',
          },
        },

        on: {
          'Set selection': {
            target: 'animating to plane',
            internal: true,
          },
        },
      },

      'animating to existing sketch': {
        invoke: [
          {
            src: 'animate-to-sketch',
            id: 'animate-to-sketch',
            onDone: 'Sketch',
          },
        ],
      },

      'Editing Extrude': {
        on: {
          'set extrude distance': {
            target: 'Editing Extrude',
            internal: true,
            actions: 'set extrude distance',
          },

          Extrude: {
            target: 'idle',
            actions: 'AST extrude 2',
          },

          'Set selection': {
            target: 'Editing Extrude',
            internal: true,
          },
        },

        entry: 'setup edit extrude',
        exit: 'tear down edit extrude',
      },
    },

    initial: 'idle',

    on: {
      Cancel: {
        target: 'idle',
        // TODO what if we're existing extrude equipped, should these actions still be fired?
        // maybe cancel needs to have a guard for if else logic?
        actions: ['reset sketch metadata'],
      },

      'Set selection': {
        target: '#Modeling',
        internal: true,
        actions: 'Set selection',
      },
    },
  },
  {
    guards: {
      'is editing existing sketch': ({ sketchPathToNode }) => {
        // should check that the variable declaration is a pipeExpression
        // and that the pipeExpression contains a "startProfileAt" callExpression
        if (!sketchPathToNode) return false
        const variableDeclaration = getNodeFromPath<VariableDeclarator>(
          kclManager.ast,
          sketchPathToNode,
          'VariableDeclarator'
        ).node
        if (variableDeclaration.type !== 'VariableDeclarator') return false
        const pipeExpression = variableDeclaration.init
        if (pipeExpression.type !== 'PipeExpression') return false
        const hasStartProfileAt = pipeExpression.body.some(
          (item) =>
            item.type === 'CallExpression' &&
            item.callee.name === 'startProfileAt'
        )
        return hasStartProfileAt && pipeExpression.body.length > 2
      },
      'Can make selection horizontal': ({ selectionRanges }) =>
        horzVertInfo(selectionRanges, 'horizontal').enabled,
      'Can make selection vertical': ({ selectionRanges }) =>
        horzVertInfo(selectionRanges, 'vertical').enabled,
      'Can constrain horizontal distance': ({ selectionRanges }) =>
        horzVertDistanceInfo({ selectionRanges, constraint: 'setHorzDistance' })
          .enabled,
      'Can constrain vertical distance': ({ selectionRanges }) =>
        horzVertDistanceInfo({ selectionRanges, constraint: 'setVertDistance' })
          .enabled,
      'Can constrain ABS X': ({ selectionRanges }) =>
        absDistanceInfo({ selectionRanges, constraint: 'xAbs' }).enabled,
      'Can constrain ABS Y': ({ selectionRanges }) =>
        absDistanceInfo({ selectionRanges, constraint: 'yAbs' }).enabled,
      'Can constrain angle': ({ selectionRanges }) =>
        angleBetweenInfo({ selectionRanges }).enabled ||
        angleLengthInfo({ selectionRanges, angleOrLength: 'setAngle' }).enabled,
      'Can constrain length': ({ selectionRanges }) =>
        angleLengthInfo({ selectionRanges }).enabled,
      'Can constrain perpendicular distance': ({ selectionRanges }) =>
        intersectInfo({ selectionRanges }).enabled,
      'Can constrain horizontally align': ({ selectionRanges }) =>
        horzVertDistanceInfo({ selectionRanges, constraint: 'setHorzDistance' })
          .enabled,
      'Can constrain vertically align': ({ selectionRanges }) =>
        horzVertDistanceInfo({ selectionRanges, constraint: 'setHorzDistance' })
          .enabled,
      'Can constrain snap to X': ({ selectionRanges }) =>
        absDistanceInfo({ selectionRanges, constraint: 'snapToXAxis' }).enabled,
      'Can constrain snap to Y': ({ selectionRanges }) =>
        absDistanceInfo({ selectionRanges, constraint: 'snapToYAxis' }).enabled,
      'Can constrain equal length': ({ selectionRanges }) =>
        setEqualLengthInfo({ selectionRanges }).enabled,
      'Can canstrain parallel': ({ selectionRanges }) =>
        equalAngleInfo({ selectionRanges }).enabled,
      'Can constrain remove constraints': ({ selectionRanges }) =>
        removeConstrainingValuesInfo({ selectionRanges }).enabled,
    },
    // end guards
    actions: {
      'set sketchMetadata from pathToNode': assign(({ sketchPathToNode }) => {
        if (!sketchPathToNode) return {}
        return getSketchMetadataFromPathToNode(sketchPathToNode)
      }),
      'hide default planes': () => {
        sceneInfra.removeDefaultPlanes()
        kclManager.hidePlanes()
      },
      'reset sketch metadata': assign({
        sketchPathToNode: null,
        sketchEnginePathId: '',
        sketchPlaneId: '',
      }),
      'set sketch metadata': assign(({ selectionRanges }) => {
        const sourceRange = selectionRanges.codeBasedSelections[0].range
        const sketchPathToNode = getNodePathFromSourceRange(
          kclManager.ast,
          sourceRange
        )
        return getSketchMetadataFromPathToNode(
          sketchPathToNode,
          selectionRanges
        )
      }),
      'set new sketch metadata': assign((_, { data }) => data),
      // TODO implement source ranges for all of these constraints
      // need to make the async like the modal constraints
      'Make selection horizontal': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintHorzVert(
          selectionRanges,
          'horizontal',
          kclManager.ast,
          kclManager.programMemory
        )
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Make selection vertical': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintHorzVert(
          selectionRanges,
          'vertical',
          kclManager.ast,
          kclManager.programMemory
        )
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain horizontally align': ({
        selectionRanges,
        sketchPathToNode,
      }) => {
        const { modifiedAst } = applyConstraintHorzVertAlign({
          selectionRanges,
          constraint: 'setVertDistance',
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain vertically align': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintHorzVertAlign({
          selectionRanges,
          constraint: 'setHorzDistance',
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain snap to X': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintAxisAlign({
          selectionRanges,
          constraint: 'snapToXAxis',
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain snap to Y': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintAxisAlign({
          selectionRanges,
          constraint: 'snapToYAxis',
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain equal length': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintEqualLength({
          selectionRanges,
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain parallel': ({ selectionRanges, sketchPathToNode }) => {
        const { modifiedAst } = applyConstraintEqualAngle({
          selectionRanges,
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'Constrain remove constraints': ({
        selectionRanges,
        sketchPathToNode,
      }) => {
        const { modifiedAst } = applyRemoveConstrainingValues({
          selectionRanges,
        })
        sceneEntitiesManager.updateAstAndRejigSketch(
          sketchPathToNode || [],
          modifiedAst
        )
      },
      'AST extrude': (_, event) => {
        if (!event.data) return
        const { selection, distance } = event.data
        const pathToNode = getNodePathFromSourceRange(
          kclManager.ast,
          selection.codeBasedSelections[0].range
        )
        const { modifiedAst, pathToExtrudeArg } = extrudeSketch(
          kclManager.ast,
          pathToNode,
          true,
          distance
        )
        // TODO not handling focusPath correctly I think
        kclManager.updateAst(modifiedAst, true, {
          focusPath: pathToExtrudeArg,
        })
      },
      'AST extrude 2': ({ extrudeDistance, sketchPathToNode }) => {
        const { modifiedAst, pathToExtrudeArg } = extrudeSketch(
          kclManager.ast,
          sketchPathToNode || [],
          true,
          extrudeDistance
        )
        kclManager.updateAst(modifiedAst, true, {
          focusPath: pathToExtrudeArg,
        })
      },
      'set extrude meta': assign({
        sketchPathToNode: ({ selectionRanges }) => {
          const pathToNode = getNodePathFromSourceRange(
            kclManager.ast,
            selectionRanges.codeBasedSelections[0].range
          )
          return pathToNode
        },
      }),
      'conditionally equip line tool': (_, { type }) => {
        if (type === 'done.invoke.animate-to-face') {
          sceneInfra.modelingSend('Equip Line tool')
        }
      },
      'setup client side sketch segments': ({ sketchPathToNode }, { type }) => {
        if (Object.keys(sceneEntitiesManager.activeSegments).length > 0) {
          sceneEntitiesManager
            .tearDownSketch({ removeAxis: false })
            .then(() => {
              sceneEntitiesManager.setupSketch({
                sketchPathToNode: sketchPathToNode || [],
              })
            })
        } else {
          sceneEntitiesManager.setupSketch({
            sketchPathToNode: sketchPathToNode || [],
          })
        }
      },
      'animate after sketch': () => {
        sceneEntitiesManager.animateAfterSketch()
      },
      'tear down client sketch': () => {
        if (sceneEntitiesManager.activeSegments) {
          sceneEntitiesManager.tearDownSketch({ removeAxis: false })
        }
      },
      'remove sketch grid': () => sceneEntitiesManager.removeSketchGrid(),
      'set up draft line': ({ sketchPathToNode }) => {
        sceneEntitiesManager.setUpDraftLine(sketchPathToNode || [])
      },
      'set up draft arc': ({ sketchPathToNode }) => {
        sceneEntitiesManager.setUpDraftArc(sketchPathToNode || [])
      },
      'set up draft line without teardown': ({ sketchPathToNode }) =>
        sceneEntitiesManager.setupSketch({
          sketchPathToNode: sketchPathToNode || [],
          draftSegment: 'line',
        }),
      'show default planes': () => {
        sceneInfra.showDefaultPlanes()
        sceneEntitiesManager.setupDefaultPlaneHover()
        kclManager.showPlanes()
      },
      'setup noPoints onClick listener': ({ sketchPathToNode }) => {
        sceneEntitiesManager.createIntersectionPlane()
        const sketchGroup = sketchGroupFromPathToNode({
          pathToNode: sketchPathToNode || [],
          ast: kclManager.ast,
          programMemory: kclManager.programMemory,
        })
        const quaternion = quaternionFromSketchGroup(sketchGroup)
        sceneEntitiesManager.intersectionPlane &&
          sceneEntitiesManager.intersectionPlane.setRotationFromQuaternion(
            quaternion
          )
        sceneInfra.setCallbacks({
          onClick: async (args) => {
            if (!args) return
            if (args.event.which !== 1) return
            const { intersection2d } = args
            if (!intersection2d || !sketchPathToNode) return
            const { modifiedAst } = addStartProfileAt(
              kclManager.ast,
              sketchPathToNode,
              [intersection2d.x, intersection2d.y]
            )
            await kclManager.updateAst(modifiedAst, false)
            sceneEntitiesManager.removeIntersectionPlane()
            sceneInfra.modelingSend('Add start point')
          },
        })
      },
      'add axis n grid': ({ sketchPathToNode }) =>
        sceneEntitiesManager.createSketchAxis(sketchPathToNode || []),
      'reset client scene mouse handlers': () => {
        // when not in sketch mode we don't need any mouse listeners
        // (note the orbit controls are always active though)
        sceneInfra.resetMouseListeners()
      },
      'setup edit extrude': ({ selectionRanges }) => {
        const pathToNode = getNodePathFromSourceRange(
          kclManager.ast,
          selectionRanges.codeBasedSelections[0].range
        )
        console.log('set up edithaesuh')
        sceneEntitiesManager.setupEditExtrude({
          sketchPathToNode: pathToNode || [],
        })
      },
      'tear down edit extrude': () => {},
      'set extrude distance': assign({
        extrudeDistance: (_, { data }) => {
          return data
        },
      }),
    },
    // end actions
  }
)

function getSketchMetadataFromPathToNode(
  pathToNode: PathToNode,
  selectionRanges?: Selections
) {
  const pipeExpression = getNodeFromPath<PipeExpression>(
    kclManager.ast,
    pathToNode,
    'PipeExpression'
  ).node
  if (pipeExpression.type !== 'PipeExpression') return {}
  const sketchCallExpression = pipeExpression.body.find(
    (e) => e.type === 'CallExpression' && e.callee.name === 'startSketchOn'
  ) as CallExpression
  if (!sketchCallExpression) return {}

  let sketchEnginePathId: string
  if (selectionRanges) {
    sketchEnginePathId =
      isCursorInSketchCommandRange(
        engineCommandManager.artifactMap,
        selectionRanges
      ) || ''
  } else {
    const _selectionRanges: Selections = {
      otherSelections: [],
      codeBasedSelections: [
        { range: [pipeExpression.start, pipeExpression.end], type: 'default' },
      ],
    }
    sketchEnginePathId =
      isCursorInSketchCommandRange(
        engineCommandManager.artifactMap,
        _selectionRanges
      ) || ''
  }
  return {
    sketchPathToNode: pathToNode,
    sketchEnginePathId,
  }
}
