// needed somewhere to dump this logic,
// Once we have xState this should be removed

import { useStore, Selections } from 'useStore'
import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ArtifactMap, EngineCommandManager } from 'lang/std/engineConnection'
import { Models } from '@kittycad/lib/dist/types/src'
import { isReducedMotion } from 'lang/util'
import { isOverlap } from 'lib/utils'

interface DefaultPlanes {
  xy: string
  yz: string
  xz: string
}

export function useAppMode() {
  const {
    guiMode,
    setGuiMode,
    selectionRanges,
    engineCommandManager,
    selectionRangeTypeMap,
  } = useStore((s) => ({
    guiMode: s.guiMode,
    setGuiMode: s.setGuiMode,
    selectionRanges: s.selectionRanges,
    engineCommandManager: s.engineCommandManager,
    selectionRangeTypeMap: s.selectionRangeTypeMap,
  }))
  const [defaultPlanes, setDefaultPlanes] = useState<DefaultPlanes | null>(null)
  useEffect(() => {
    if (
      guiMode.mode === 'sketch' &&
      guiMode.sketchMode === 'selectFace' &&
      engineCommandManager
    ) {
      if (!defaultPlanes) {
        const xy = createPlane(engineCommandManager, {
          x_axis: { x: 1, y: 0, z: 0 },
          y_axis: { x: 0, y: 1, z: 0 },
          color: { r: 0.7, g: 0.28, b: 0.28, a: 0.4 },
        })
        const yz = createPlane(engineCommandManager, {
          x_axis: { x: 0, y: 1, z: 0 },
          y_axis: { x: 0, y: 0, z: 1 },
          color: { r: 0.28, g: 0.7, b: 0.28, a: 0.4 },
        })
        const xz = createPlane(engineCommandManager, {
          x_axis: { x: 1, y: 0, z: 0 },
          y_axis: { x: 0, y: 0, z: 1 },
          color: { r: 0.28, g: 0.28, b: 0.7, a: 0.4 },
        })
        setDefaultPlanes({ xy, yz, xz })
      } else {
        hideDefaultPlanes(engineCommandManager, defaultPlanes)
      }
    }
    if (guiMode.mode !== 'sketch' && defaultPlanes) {
      Object.values(defaultPlanes).forEach((planeId) => {
        engineCommandManager?.sendSceneCommand({
          type: 'modeling_cmd_req',
          cmd_id: uuidv4(),
          cmd: {
            type: 'object_visible',
            object_id: planeId,
            hidden: true,
          },
        })
      })
    } else if (guiMode.mode === 'default') {
      const pathId =
        engineCommandManager &&
        isCursorInSketchCommandRange(
          engineCommandManager.artifactMap,
          selectionRanges
        )
      if (pathId) {
        setGuiMode({
          mode: 'canEditSketch',
          rotation: [0, 0, 0, 1],
          position: [0, 0, 0],
          pathToNode: [],
          pathId,
        })
      }
    } else if (guiMode.mode === 'canEditSketch') {
      if (
        !engineCommandManager ||
        !isCursorInSketchCommandRange(
          engineCommandManager.artifactMap,
          selectionRanges
        )
      ) {
        setGuiMode({
          mode: 'default',
        })
      }
    }
  }, [
    guiMode,
    guiMode.mode,
    engineCommandManager,
    selectionRanges,
    selectionRangeTypeMap,
  ])

  useEffect(() => {
    const unSub = engineCommandManager?.subscribeTo({
      event: 'select_with_point',
      callback: async ({ data }) => {
        if (!data.entity_id) return
        if (!defaultPlanes) return
        if (!Object.values(defaultPlanes || {}).includes(data.entity_id)) {
          // user clicked something else in the scene
          return
        }
        const sketchModeResponse = await engineCommandManager?.sendSceneCommand(
          {
            type: 'modeling_cmd_req',
            cmd_id: uuidv4(),
            cmd: {
              type: 'sketch_mode_enable',
              plane_id: data.entity_id,
              ortho: true,
              animated: !isReducedMotion(),
            },
          }
        )
        hideDefaultPlanes(engineCommandManager, defaultPlanes)
        const sketchUuid = uuidv4()
        const proms: any[] = []
        proms.push(
          engineCommandManager.sendSceneCommand({
            type: 'modeling_cmd_req',
            cmd_id: sketchUuid,
            cmd: {
              type: 'start_path',
            },
          })
        )
        proms.push(
          engineCommandManager.sendSceneCommand({
            type: 'modeling_cmd_req',
            cmd_id: uuidv4(),
            cmd: {
              type: 'edit_mode_enter',
              target: sketchUuid,
            },
          })
        )
        const res = await Promise.all(proms)
        console.log('res', res)
        setGuiMode({
          mode: 'sketch',
          sketchMode: 'sketchEdit',
          rotation: [0, 0, 0, 1],
          position: [0, 0, 0],
          pathToNode: [],
        })

        console.log('sketchModeResponse', sketchModeResponse)
      },
    })
    return unSub
  }, [engineCommandManager, defaultPlanes])
}

function createPlane(
  engineCommandManager: EngineCommandManager,
  {
    x_axis,
    y_axis,
    color,
  }: {
    x_axis: Models['Point3d_type']
    y_axis: Models['Point3d_type']
    color: Models['Color_type']
  }
) {
  const planeId = uuidv4()
  engineCommandManager?.sendSceneCommand({
    type: 'modeling_cmd_req',
    cmd: {
      type: 'make_plane',
      size: 60,
      origin: { x: 0, y: 0, z: 0 },
      x_axis,
      y_axis,
      clobber: false,
    },
    cmd_id: planeId,
  })
  engineCommandManager?.sendSceneCommand({
    type: 'modeling_cmd_req',
    cmd: {
      type: 'plane_set_color',
      plane_id: planeId,
      color,
    },
    cmd_id: uuidv4(),
  })
  return planeId
}

function hideDefaultPlanes(
  engineCommandManager: EngineCommandManager,
  defaultPlanes: DefaultPlanes
) {
  Object.values(defaultPlanes).forEach((planeId) => {
    engineCommandManager?.sendSceneCommand({
      type: 'modeling_cmd_req',
      cmd_id: uuidv4(),
      cmd: {
        type: 'object_visible',
        object_id: planeId,
        hidden: true,
      },
    })
  })
}

function isCursorInSketchCommandRange(
  artifactMap: ArtifactMap,
  selectionRanges: Selections
): string | false {
  const overlapingEntries = Object.entries(artifactMap || {}).filter(
    ([id, artifact]) =>
      selectionRanges.codeBasedSelections.some(
        (selection) =>
          Array.isArray(selection.range) &&
          Array.isArray(artifact.range) &&
          isOverlap(selection.range, artifact.range) &&
          (artifact.commandType === 'start_path' ||
            artifact.commandType === 'extend_path' ||
            'close_path')
      )
  )
  return overlapingEntries.length === 1 && overlapingEntries[0][1].parentId
    ? overlapingEntries[0][1].parentId
    : false
}