import { assign, createMachine } from 'xstate'
import { Themes, getSystemTheme, setThemeClass } from '../lib/theme'
import { CameraSystem } from 'lib/cameraControls'
import { isTauri } from 'lib/isTauri'
import { writeToSettingsFile } from 'lib/tauriFS'
import {
  BaseUnit,
  DEFAULT_PROJECT_NAME,
  SETTINGS_PERSIST_KEY,
  SettingsMachineContext,
  Toggle,
  UnitSystem,
  initialSettings,
} from 'lib/settings'

export const settingsMachine = createMachine(
  {
    /** @xstate-layout N4IgpgJg5mDOIC5QGUwBc0EsB2VYDpMIAbMAYlTQAIAVACzAFswBtABgF1FQAHAe1iYsfbNxAAPRAA42+AEwB2KQFYAzGznKAnADZli1QBoQAT2kBGKfm37lOned3nzqgL6vjlLLgJFSFdCoAETAAMwBDAFdiagAFACc+ACswAGNqADlw5nYuJBB+QWFRfMkEABY5fDYa2rra83LjMwQdLWV8BXLyuxlVLU1Ld090bzxCEnJKYLComODMeLS0PniTXLFCoUwRMTK7fC1zNql7NgUjtnKjU0RlBSqpLVUVPVUda60tYZAvHHG-FNAgBVbBCKjIEywNBMDb5LbFPaILqdfRSORsS4qcxXZqIHqyK6qY4XOxsGTKco-P4+Cb+aYAIXCsDAVFBQjhvAE212pWkskUKnUml0+gUNxaqkU+EccnKF1UCnucnMcjcHl+o3+vkmZBofCgUFIMwARpEoFRYuFsGBiJyCtzEXzWrJlGxlKdVFKvfY1XiEBjyvhVOVzBdzu13pYFNStbTAQFqAB5bAmvjheIQf4QtDhNCRWD2hE7EqgfayHTEh7lHQNSxSf1Scz4cpHHFyFVujTKczuDXYPgQOBiGl4TaOktIhAAWg6X3nC4Xp39050sYw2rpYHHRUnztVhPJqmUlIGbEriv9WhrLZ6uibHcqUr7riAA */
    id: 'Settings',
    predictableActionArguments: true,
    context: { ...initialSettings },
    initial: 'idle',
    states: {
      idle: {
        entry: ['setThemeClass'],
        on: {
          'Set All Settings': {
            actions: [
              assign((context, event) => {
                return {
                  ...context,
                  ...event.data,
                }
              }),
              'persistSettings',
              'setThemeClass',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Base Unit': {
            actions: [
              assign({
                baseUnit: (_, event) => {
                  console.log('event', event)
                  return event.data.baseUnit
                },
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Camera Controls': {
            actions: [
              assign({
                cameraControls: (_, event) => event.data.cameraControls,
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Default Directory': {
            actions: [
              assign({
                defaultDirectory: (_, event) => event.data.defaultDirectory,
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Default Project Name': {
            actions: [
              assign({
                defaultProjectName: (_, event) =>
                  event.data.defaultProjectName.trim() || DEFAULT_PROJECT_NAME,
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Onboarding Status': {
            actions: [
              assign({
                onboardingStatus: (_, event) => event.data.onboardingStatus,
              }),
              'persistSettings',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Text Wrapping': {
            actions: [
              assign({
                textWrapping: (_, event) => event.data.textWrapping,
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Theme': {
            actions: [
              assign({
                theme: (_, event) => event.data.theme,
              }),
              'persistSettings',
              'toastSuccess',
              'setThemeClass',
            ],
            target: 'idle',
            internal: true,
          },
          'Set Unit System': {
            actions: [
              assign({
                unitSystem: (_, event) => event.data.unitSystem,
                baseUnit: (_, event) =>
                  event.data.unitSystem === 'imperial' ? 'in' : 'mm',
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
          'Toggle Debug Panel': {
            actions: [
              assign({
                showDebugPanel: (context) => {
                  return !context.showDebugPanel
                },
              }),
              'persistSettings',
              'toastSuccess',
            ],
            target: 'idle',
            internal: true,
          },
        },
      },
    },
    tsTypes: {} as import('./settingsMachine.typegen').Typegen0,
    schema: {
      events: {} as
        | { type: 'Set All Settings'; data: Partial<SettingsMachineContext> }
        | { type: 'Set Base Unit'; data: { baseUnit: BaseUnit } }
        | {
            type: 'Set Camera Controls'
            data: { cameraControls: CameraSystem }
          }
        | { type: 'Set Default Directory'; data: { defaultDirectory: string } }
        | {
            type: 'Set Default Project Name'
            data: { defaultProjectName: string }
          }
        | { type: 'Set Onboarding Status'; data: { onboardingStatus: string } }
        | { type: 'Set Text Wrapping'; data: { textWrapping: Toggle } }
        | { type: 'Set Theme'; data: { theme: Themes } }
        | {
            type: 'Set Unit System'
            data: { unitSystem: UnitSystem }
          }
        | { type: 'Toggle Debug Panel' },
    },
  },
  {
    actions: {
      persistSettings: (context) => {
        if (isTauri()) {
          writeToSettingsFile(context).catch((err) => {
            console.error('Error writing settings:', err)
          })
        }
        try {
          localStorage.setItem(SETTINGS_PERSIST_KEY, JSON.stringify(context))
        } catch (e) {
          console.error(e)
        }
      },
      setThemeClass: (context, event) => {
        const currentTheme =
          event.type === 'Set Theme' ? event.data.theme : context.theme
        setThemeClass(
          currentTheme === Themes.System ? getSystemTheme() : currentTheme
        )
      },
    },
  }
)
