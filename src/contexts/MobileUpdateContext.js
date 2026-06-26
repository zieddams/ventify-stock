import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  cleanupDownloadedApks,
  clearPersistedUpdateState,
  createApkDownloadResumable,
  findExistingDownloadedApk,
  getPersistedUpdateState,
  installDownloadedApk,
  isInAppUpdateSupported,
  persistUpdateState,
} from '../services/mobileUpdateService'

const MobileUpdateContext = createContext(null)

function createIdleState() {
  return {
    status: 'idle',
    version: '',
    url: '',
    fileUri: '',
    expectedBytes: 0,
    expectedSha256: null,
    resumeData: null,
    autoResumeOnActive: false,
    progress: null,
    updatedAt: '',
    errorMessage: '',
  }
}

function normalizeReleasePayload(release) {
  if (!release?.version || !release?.apkUrl) {
    return null
  }

  return {
    version: String(release.version).trim(),
    url: String(release.apkUrl).trim(),
    expectedBytes: Number(release.apkSize || 0),
    expectedSha256: release.apkSha256 || null,
  }
}

export function MobileUpdateProvider({ children }) {
  const [updateState, setUpdateState] = useState(createIdleState)
  const taskRef = useRef(null)
  const taskKeyRef = useRef('')
  const pausePromiseRef = useRef(null)
  const hydrationFinishedRef = useRef(false)
  const stateRef = useRef(createIdleState())
  const appStateRef = useRef(AppState.currentState)

  const commitState = useCallback(async (nextState, { persist = true } = {}) => {
    stateRef.current = nextState
    setUpdateState(nextState)

    if (!persist) {
      return nextState
    }

    if (nextState.status === 'idle') {
      await clearPersistedUpdateState()
      return nextState
    }

    await persistUpdateState(nextState)
    return nextState
  }, [])

  const resetState = useCallback(async () => {
    taskRef.current = null
    taskKeyRef.current = ''
    await commitState(createIdleState())
  }, [commitState])

  const installReadyApk = useCallback(async (payload) => {
    const nextState = {
      ...stateRef.current,
      ...payload,
      status: 'downloaded',
      progress: {
        writtenBytes: payload.expectedBytes || stateRef.current.progress?.writtenBytes || 0,
        expectedBytes: payload.expectedBytes || stateRef.current.progress?.expectedBytes || 0,
        ratio: 1,
      },
      resumeData: null,
      autoResumeOnActive: false,
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    }

    await commitState(nextState)
    await installDownloadedApk(nextState.fileUri)
    return nextState.fileUri
  }, [commitState])

  const finalizeDownload = useCallback(async (releasePayload, fileUri) => {
    const readyFile = await findExistingDownloadedApk({
      version: releasePayload.version,
      fileUri,
      expectedBytes: releasePayload.expectedBytes,
      expectedSha256: releasePayload.expectedSha256,
    })

    if (!readyFile?.fileUri) {
      throw new Error('Le fichier APK téléchargé est introuvable.')
    }

    await installReadyApk({
      version: releasePayload.version,
      url: releasePayload.url,
      fileUri: readyFile.fileUri,
      expectedBytes: releasePayload.expectedBytes,
      expectedSha256: releasePayload.expectedSha256,
    })
  }, [installReadyApk])

  const markError = useCallback(async (message, extras = {}) => {
    await commitState({
      ...stateRef.current,
      ...extras,
      status: extras.status || 'error',
      errorMessage: String(message || '').trim(),
      updatedAt: new Date().toISOString(),
    })
  }, [commitState])

  const startTransfer = useCallback(async (release, { resumeData = null, autoResumeOnActive = false } = {}) => {
    if (!isInAppUpdateSupported()) {
      throw new Error("L'installation intégrée de mise à jour est disponible uniquement sur Android.")
    }

    const releasePayload = normalizeReleasePayload(release)
    if (!releasePayload) {
      throw new Error('Aucun fichier APK n’est disponible pour cette release.')
    }

    const transferKey = `${releasePayload.version}:${releasePayload.url}`
    if (taskRef.current && taskKeyRef.current === transferKey && stateRef.current.status === 'downloading') {
      return
    }

    const existingApk = await findExistingDownloadedApk({
      version: releasePayload.version,
      expectedBytes: releasePayload.expectedBytes,
      expectedSha256: releasePayload.expectedSha256,
    })

    if (existingApk?.fileUri) {
      await installReadyApk({
        ...releasePayload,
        fileUri: existingApk.fileUri,
      })
      return
    }

    await cleanupDownloadedApks({ keepVersions: [releasePayload.version] })

    const { fileUri, task } = await createApkDownloadResumable({
      url: releasePayload.url,
      version: releasePayload.version,
      resumeData,
      onProgress: (progress) => {
        const nextState = {
          ...stateRef.current,
          status: 'downloading',
          version: releasePayload.version,
          url: releasePayload.url,
          fileUri,
          expectedBytes: releasePayload.expectedBytes,
          expectedSha256: releasePayload.expectedSha256,
          progress,
          resumeData: null,
          autoResumeOnActive,
          errorMessage: '',
          updatedAt: new Date().toISOString(),
        }

        stateRef.current = nextState
        setUpdateState(nextState)
      },
    })

    taskRef.current = task
    taskKeyRef.current = transferKey

    await commitState({
      status: 'downloading',
      version: releasePayload.version,
      url: releasePayload.url,
      fileUri,
      expectedBytes: releasePayload.expectedBytes,
      expectedSha256: releasePayload.expectedSha256,
      progress: {
        writtenBytes: 0,
        expectedBytes: releasePayload.expectedBytes,
        ratio: 0,
      },
      resumeData: null,
      autoResumeOnActive,
      errorMessage: '',
      updatedAt: new Date().toISOString(),
    })

    try {
      const result = resumeData ? await task.resumeAsync() : await task.downloadAsync()

      taskRef.current = null
      taskKeyRef.current = ''

      if (!result?.uri) {
        return
      }

      await finalizeDownload(releasePayload, result.uri)
    } catch (error) {
      taskRef.current = null
      taskKeyRef.current = ''

      if (stateRef.current.status === 'paused') {
        return
      }

      throw error
    }
  }, [commitState, finalizeDownload, installReadyApk])

  const pauseDownload = useCallback(async ({ autoResumeOnActive = true } = {}) => {
    if (!taskRef.current || stateRef.current.status !== 'downloading') {
      return stateRef.current
    }

    if (pausePromiseRef.current) {
      return pausePromiseRef.current
    }

    pausePromiseRef.current = (async () => {
      try {
        const pauseState = await taskRef.current.pauseAsync()
        taskRef.current = null
        taskKeyRef.current = ''

        const nextState = {
          ...stateRef.current,
          status: 'paused',
          resumeData: pauseState?.resumeData || stateRef.current.resumeData || null,
          autoResumeOnActive,
          updatedAt: new Date().toISOString(),
        }

        await commitState(nextState)
        return nextState
      } finally {
        pausePromiseRef.current = null
      }
    })()

    return pausePromiseRef.current
  }, [commitState])

  const resumeDownload = useCallback(async () => {
    if (stateRef.current.status === 'paused' && stateRef.current.resumeData) {
      await startTransfer({
        version: stateRef.current.version,
        apkUrl: stateRef.current.url,
        apkSize: stateRef.current.expectedBytes,
        apkSha256: stateRef.current.expectedSha256,
      }, {
        resumeData: stateRef.current.resumeData,
        autoResumeOnActive: stateRef.current.autoResumeOnActive,
      })
      return
    }

    if (stateRef.current.status === 'downloaded' && stateRef.current.fileUri) {
      await installReadyApk({
        version: stateRef.current.version,
        url: stateRef.current.url,
        fileUri: stateRef.current.fileUri,
        expectedBytes: stateRef.current.expectedBytes,
        expectedSha256: stateRef.current.expectedSha256,
      })
    }
  }, [installReadyApk, startTransfer])

  const startOrResumeUpdate = useCallback(async (release) => {
    try {
      const releasePayload = normalizeReleasePayload(release)
      if (!releasePayload) {
        throw new Error('Aucun fichier APK n’est disponible pour cette release.')
      }

      const sameRelease = (
        stateRef.current.version === releasePayload.version &&
        stateRef.current.url === releasePayload.url
      )

      if (sameRelease && stateRef.current.status === 'paused' && stateRef.current.resumeData) {
        await resumeDownload()
        return
      }

      if (sameRelease && stateRef.current.status === 'downloaded' && stateRef.current.fileUri) {
        await resumeDownload()
        return
      }

      await startTransfer(release, { autoResumeOnActive: false })
    } catch (error) {
      await markError(error?.message || 'La mise à jour a échoué.')
      throw error
    }
  }, [markError, resumeDownload, startTransfer])

  const clearUpdateError = useCallback(async () => {
    if (!stateRef.current.errorMessage) return

    const nextStatus = stateRef.current.fileUri ? 'downloaded' : 'idle'
    const nextState = nextStatus === 'idle'
      ? createIdleState()
      : {
          ...stateRef.current,
          status: nextStatus,
          errorMessage: '',
          updatedAt: new Date().toISOString(),
        }

    await commitState(nextState)
  }, [commitState])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const persisted = await getPersistedUpdateState()
      if (!mounted) return

      hydrationFinishedRef.current = true

      if (!persisted) {
        return
      }

      const existingApk = await findExistingDownloadedApk({
        version: persisted.version,
        fileUri: persisted.fileUri,
        expectedBytes: persisted.expectedBytes,
        expectedSha256: persisted.expectedSha256,
      })

      if (existingApk?.fileUri) {
        await commitState({
          ...persisted,
          status: 'downloaded',
          fileUri: existingApk.fileUri,
          resumeData: null,
          autoResumeOnActive: false,
          progress: {
            writtenBytes: persisted.expectedBytes || existingApk.size || 0,
            expectedBytes: persisted.expectedBytes || existingApk.size || 0,
            ratio: 1,
          },
          errorMessage: '',
          updatedAt: new Date().toISOString(),
        })
        return
      }

      if (persisted.status === 'paused' && persisted.resumeData) {
        await commitState(persisted)
        if (AppState.currentState === 'active' && persisted.autoResumeOnActive) {
          try {
            await resumeDownload()
          } catch {
            // The profile page can retry explicitly if auto-resume fails.
          }
        }
        return
      }

      await resetState()
    })()

    return () => {
      mounted = false
    }
  }, [commitState, resetState, resumeDownload])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current
      appStateRef.current = nextState

      if (!hydrationFinishedRef.current) {
        return
      }

      if (nextState === 'active' && previousState !== 'active') {
        if (stateRef.current.status === 'paused' && stateRef.current.autoResumeOnActive) {
          void resumeDownload()
        }
        return
      }

      if ((nextState === 'inactive' || nextState === 'background') && stateRef.current.status === 'downloading') {
        void pauseDownload({ autoResumeOnActive: true })
      }
    })

    return () => {
      subscription.remove()
    }
  }, [pauseDownload, resumeDownload])

  const value = useMemo(() => ({
    updateState,
    isSupported: isInAppUpdateSupported(),
    startOrResumeUpdate,
    pauseDownload,
    resumeDownload,
    clearUpdateError,
    resetState,
  }), [clearUpdateError, pauseDownload, resetState, resumeDownload, startOrResumeUpdate, updateState])

  return (
    <MobileUpdateContext.Provider value={value}>
      {children}
    </MobileUpdateContext.Provider>
  )
}

export function useMobileUpdate() {
  const context = useContext(MobileUpdateContext)

  if (!context) {
    throw new Error('useMobileUpdate must be used within a MobileUpdateProvider.')
  }

  return context
}
