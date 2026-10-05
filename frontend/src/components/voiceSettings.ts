// Must match the backend's VoiceSettings (bounds and defaults).
export type VoiceSettings = {
  precision: number
  expressiveness: number
  speed: number
  pitch: number
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  precision: 1,
  expressiveness: 0.7,
  speed: 1,
  pitch: 0,
}
