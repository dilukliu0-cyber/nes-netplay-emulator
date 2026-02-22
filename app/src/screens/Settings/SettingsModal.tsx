import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { t } from "../../i18n";
import { setTheme } from "../../theme/themeManager";
import type {
  AudioSettings,
  ControlSettings,
  LocalSignalingServerStatus,
  NetworkSettings,
  NgrokTunnelStatus,
  Profile,
  ReplaySettings,
  RetroApiKeyStatus,
  UiSettings,
  VideoSettings
} from "../../types/global";

type SettingsCategory = "general" | "controls" | "video" | "audio" | "network" | "library" | "about";
type ControlAction = keyof ControlSettings;

const categories: Array<{ id: SettingsCategory; label: string }> = [
  { id: "general", label: t("settings.general") },
  { id: "controls", label: t("settings.controls") },
  { id: "video", label: t("settings.video") },
  { id: "audio", label: t("settings.audio") },
  { id: "network", label: t("settings.network") },
  { id: "library", label: t("settings.library") },
  { id: "about", label: t("settings.about") }
];

const controlLabels: Record<ControlAction, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  a: "A",
  b: "B",
  start: "Start",
  select: "Select"
};

export function SettingsModal(props: {
  open: boolean;
  category: SettingsCategory;
  onCategoryChange: (id: SettingsCategory) => void;
  onClose: () => void;
  profile: Profile | null;
  profileNameInput: string;
  onProfileNameInputChange: (value: string) => void;
  onSaveProfileName: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
  controls: ControlSettings;
  waitingAction: ControlAction | null;
  onStartRebind: (action: ControlAction) => void;
  onResetControls: () => void;
  uiSettings: UiSettings;
  onSaveUiSettings: (patch: Partial<UiSettings>) => void;
  raApiKeyInput: string;
  onRaApiKeyInputChange: (value: string) => void;
  onSaveRaApiKey: () => void;
  onClearRaApiKey: () => void;
  raApiKeyBusy: boolean;
  raApiKeyStatus: RetroApiKeyStatus | null;
  audioSettings: AudioSettings;
  onSaveAudio: (patch: Partial<AudioSettings>) => void;
  videoSettings: VideoSettings;
  onSaveVideo: (patch: Partial<VideoSettings>) => void;
  replaySettings: ReplaySettings;
  onSaveReplay: (patch: Partial<ReplaySettings>) => void;
  onResetReplay: () => void;
  onOpenReplaysFolder: () => void;
  networkSettings: NetworkSettings;
  networkInput: string;
  onNetworkInputChange: (value: string) => void;
  onNetworkModeChange: (mode: NetworkSettings["netplayMode"]) => void;
  onConnectServer: () => void;
  networkBusy: boolean;
  localServerStatus: LocalSignalingServerStatus | null;
  localServerBusy: boolean;
  onStartLocalServer: () => void;
  onStopLocalServer: () => void;
  ngrokStatus: NgrokTunnelStatus | null;
  ngrokBusy: boolean;
  onStartNgrok: () => void;
  onStopNgrok: () => void;
}) {
  const {
    open, category, onCategoryChange, onClose,
    profile, profileNameInput, onProfileNameInputChange, onSaveProfileName, onPickAvatar, onRemoveAvatar,
    controls, waitingAction, onStartRebind, onResetControls,
    uiSettings, onSaveUiSettings,
    raApiKeyInput, onRaApiKeyInputChange, onSaveRaApiKey, onClearRaApiKey, raApiKeyBusy, raApiKeyStatus,
    audioSettings, onSaveAudio, videoSettings, onSaveVideo,
    replaySettings, onSaveReplay, onResetReplay, onOpenReplaysFolder,
    networkSettings,
    networkInput,
    onNetworkInputChange,
    onNetworkModeChange,
    onConnectServer,
    networkBusy,
    localServerStatus,
    localServerBusy,
    onStartLocalServer,
    onStopLocalServer,
    ngrokStatus,
    ngrokBusy,
    onStartNgrok,
    onStopNgrok
  } = props;
  const liveWindowBackground = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue("--bg-window").trim().toUpperCase()
    : "";
  const liveAccent = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase()
    : "";

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <Card className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t("settings.title")}</h2>
          <Button variant="ghost" data-variant="soft" onClick={onClose}>{t("settings.close")}</Button>
        </div>

        <div className="settings-body-shell">
          <aside className="settings-nav">
            {categories.map((c) => (
              <button key={c.id} className={category === c.id ? "active" : ""} onClick={() => onCategoryChange(c.id)}>{c.label}</button>
            ))}
          </aside>

          <section className="settings-content">
            {category === "general" && (
              <Card className="settings-pane">
                <h3>{t("settings.general")}</h3>
                <p>{t("settings.steamLike")}</p>
                <div className="settings-grid settings-grid-two">
                  <label>
                    Nickname
                    <Input
                      value={profileNameInput}
                      onChange={(event) => onProfileNameInputChange(event.target.value)}
                      placeholder="Player"
                    />
                  </label>
                  <div className="settings-actions settings-profile-actions">
                    <Button variant="primary" data-variant="soft" onClick={onSaveProfileName}>Save nickname</Button>
                  </div>
                </div>
                <div className="settings-profile-avatar-row">
                  {profile?.avatarDataUrl ? (
                    <img src={profile.avatarDataUrl} alt="Avatar" className="settings-profile-avatar" />
                  ) : (
                    <div className="settings-profile-avatar-placeholder">No avatar</div>
                  )}
                  <div className="settings-actions">
                    <Button variant="secondary" data-variant="soft" onClick={onPickAvatar}>Choose avatar</Button>
                    <Button variant="danger" data-variant="danger" onClick={onRemoveAvatar} disabled={!profile?.avatarDataUrl}>Remove avatar</Button>
                  </div>
                </div>
                <div className="settings-grid settings-grid-two">
                  <label>
                    Тема
                    <select
                      value={uiSettings.theme}
                      onChange={(e) => {
                        const nextTheme = e.target.value as UiSettings["theme"];
                        setTheme(nextTheme);
                        onSaveUiSettings({ theme: nextTheme });
                      }}
                    >
                      <option value="blue">Steam Dark (Blue)</option>
                      <option value="pink">Pink Cute</option>
                    </select>
                  </label>
                  <label>
                    RetroAchievements username
                    <Input
                      value={uiSettings.retroAchievementsUsername}
                      onChange={(event) => onSaveUiSettings({ retroAchievementsUsername: event.target.value })}
                      placeholder="username"
                    />
                  </label>
                </div>
                <div className="settings-grid">
                  <label>
                    RetroAchievements API key
                    <Input
                      type="password"
                      value={raApiKeyInput}
                      onChange={(event) => onRaApiKeyInputChange(event.target.value)}
                      placeholder="Paste API key"
                    />
                  </label>
                  <div className="settings-actions">
                    <Button variant="secondary" data-variant="soft" onClick={onSaveRaApiKey} disabled={raApiKeyBusy || !raApiKeyInput.trim()}>
                      Save API key
                    </Button>
                    <Button variant="danger" data-variant="danger" onClick={onClearRaApiKey} disabled={raApiKeyBusy}>
                      Clear API key
                    </Button>
                  </div>
                  <p className="settings-inline-note">
                    {raApiKeyStatus?.configured
                      ? `API key configured (${raApiKeyStatus.source}${raApiKeyStatus.persistent ? ", persistent" : ", session only"})`
                      : "API key is not configured"}
                  </p>
                </div>
                <div className="settings-theme-proof">
                  <span>{`WindowBackground: ${liveWindowBackground}`}</span>
                  <span>{`Accent: ${liveAccent}`}</span>
                </div>
              </Card>
            )}

            {category === "controls" && (
              <Card className="settings-pane">
                <h3>{t("settings.controls")}</h3>
                <div className="settings-grid">
                  <label>
                    {t("settings.preset")}
                    <select value={uiSettings.controlPreset} onChange={(e) => onSaveUiSettings({ controlPreset: e.target.value as UiSettings["controlPreset"] })}>
                      <option value="keyboard">{t("settings.keyboard")}</option>
                      <option value="gamepad">{t("settings.gamepad")}</option>
                    </select>
                  </label>
                </div>

                <div className="control-grid">
                  {(Object.keys(controlLabels) as ControlAction[]).map((action) => (
                    <div key={action} className="control-row">
                      <span>{controlLabels[action]}</span>
                      <code>{waitingAction === action ? "Press key..." : controls[action]}</code>
                      <Button variant="secondary" onClick={() => onStartRebind(action)}>{t("settings.rebind")}</Button>
                    </div>
                  ))}
                </div>

                <Button variant="danger" onClick={onResetControls}>{t("settings.resetDefaults")}</Button>

                <h3>{t("settings.snesControls")}</h3>
                <p>{t("settings.snesHint")}</p>
              </Card>
            )}

            {category === "video" && (
              <Card className="settings-pane">
                <h3>{t("settings.video")}: Image Filters</h3>
                <div className="settings-grid settings-grid-two">
                  <label>
                    {t("settings.scale")}
                    <select value={videoSettings.scale} onChange={(e) => onSaveVideo({ scale: e.target.value as VideoSettings["scale"] })}>
                      <option value="2x">2x</option>
                      <option value="3x">3x</option>
                      <option value="4x">4x</option>
                      <option value="fit">Fit</option>
                    </select>
                  </label>

                  <label>
                    {t("settings.pixelMode")}
                    <select value={videoSettings.pixelMode} onChange={(e) => onSaveVideo({ pixelMode: e.target.value as VideoSettings["pixelMode"] })}>
                      <option value="nearest">Pixel perfect (Nearest)</option>
                      <option value="smooth">Smooth (Bilinear)</option>
                    </select>
                  </label>
                </div>

                <label className="checkbox-row">
                  <input type="checkbox" checked={videoSettings.crtEnabled} onChange={(e) => onSaveVideo({ crtEnabled: e.target.checked })} />
                  {t("settings.crt")}
                </label>

                <div className="settings-grid">
                  <label>
                    Scanlines intensity: {videoSettings.scanlinesIntensity}
                    <input type="range" min={0} max={100} value={videoSettings.scanlinesIntensity} onChange={(e) => onSaveVideo({ scanlinesIntensity: Number(e.target.value) })} />
                  </label>
                  <label>
                    Bloom / Glow: {videoSettings.bloom}
                    <input type="range" min={0} max={100} value={videoSettings.bloom} onChange={(e) => onSaveVideo({ bloom: Number(e.target.value) })} />
                  </label>
                </div>

                <label className="checkbox-row">
                  <input type="checkbox" checked={videoSettings.vignette} onChange={(e) => onSaveVideo({ vignette: e.target.checked })} />
                  {t("settings.vignette")}
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={videoSettings.colorCorrection} onChange={(e) => onSaveVideo({ colorCorrection: e.target.checked })} />
                  {t("settings.colorCorrection")}
                </label>

                <div className="settings-preview-note">{t("settings.previewNote")}</div>

                <h3>{t("settings.recordingReplay")}</h3>
                <label className="checkbox-row">
                  <input type="checkbox" checked={replaySettings.enabled} onChange={(e) => onSaveReplay({ enabled: e.target.checked })} />
                  {t("settings.enableReplay")}
                </label>

                <div className="settings-grid settings-grid-two">
                  <label>
                    {t("settings.hotkey")}
                    <Input value={replaySettings.hotkey} onChange={(e) => onSaveReplay({ hotkey: e.target.value.toUpperCase() })} placeholder="F8" />
                  </label>
                  <label>
                    {t("settings.prebufferSeconds")}
                    <input type="range" min={5} max={30} value={replaySettings.prebufferSeconds} onChange={(e) => onSaveReplay({ prebufferSeconds: Number(e.target.value) })} />
                    <span className="slider-note">{replaySettings.prebufferSeconds} sec</span>
                  </label>
                </div>

                <div className="settings-grid settings-grid-two">
                  <label>
                    {t("settings.quality")}
                    <select value={replaySettings.quality} onChange={(e) => onSaveReplay({ quality: e.target.value as ReplaySettings["quality"] })}>
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </label>
                  <label>
                    {t("settings.fps")}
                    <select value={String(replaySettings.fps)} onChange={(e) => onSaveReplay({ fps: Number(e.target.value) as ReplaySettings["fps"] })}>
                      <option value="30">30</option>
                      <option value="60">60</option>
                    </select>
                  </label>
                </div>

                <div className="settings-grid settings-grid-two">
                  <label>
                    {t("settings.format")}
                    <Input value={replaySettings.format} readOnly />
                  </label>
                  <label>
                    {t("settings.saveFolder")}
                    <Input value={replaySettings.saveFolder} readOnly />
                  </label>
                </div>

                <div className="settings-actions">
                  <Button variant="secondary" onClick={onOpenReplaysFolder}>{t("settings.openReplayFolder")}</Button>
                  <Button variant="danger" onClick={onResetReplay}>{t("settings.resetReplaySettings")}</Button>
                </div>
              </Card>
            )}

            {category === "audio" && (
              <Card className="settings-pane">
                <h3>{t("settings.audio")}</h3>
                <div className="settings-grid">
                  <label>
                    {t("settings.sound")}
                    <select value={audioSettings.enabled ? "on" : "off"} onChange={(e) => onSaveAudio({ enabled: e.target.value === "on" })}>
                      <option value="on">{t("settings.on")}</option>
                      <option value="off">{t("settings.off")}</option>
                    </select>
                  </label>
                  <label>
                    {t("settings.volume")}
                    <input type="range" min={0} max={100} value={audioSettings.volume} onChange={(e) => onSaveAudio({ volume: Number(e.target.value) })} />
                  </label>
                  <label>
                    {t("settings.latency")}
                    <input type="range" min={0} max={500} step={10} value={audioSettings.latency} onChange={(e) => onSaveAudio({ latency: Number(e.target.value) })} />
                  </label>
                </div>
              </Card>
            )}

            {category === "network" && (
              <Card className="settings-pane">
                <h3>{t("settings.network")}</h3>
                <div className="settings-grid">
                  <label>
                    {t("settings.signalingServer")}
                    <div className="network-connect-row">
                      <Input value={networkInput} onChange={(e) => onNetworkInputChange(e.target.value)} placeholder="ws://localhost:8787" />
                      <Button variant="secondary" data-action="play" onClick={onConnectServer} disabled={networkBusy}>{networkBusy ? "..." : t("settings.connect")}</Button>
                    </div>
                  </label>

                  <label>
                    {t("settings.netplayMode")}
                    <select
                      value={networkSettings.netplayMode}
                      onChange={(e) => onNetworkModeChange(e.target.value as NetworkSettings["netplayMode"])}
                    >
                      <option value="stream">{t("settings.streaming")}</option>
                      <option value="lockstep">{t("settings.lockstep")}</option>
                    </select>
                  </label>
                </div>

                <div className="network-current">
                  <p>URL: {networkSettings.signalingUrl}</p>
                  <p>
                    Local server: {localServerStatus?.running ? "Running" : "Stopped"}
                    {localServerStatus?.pid ? ` (PID ${localServerStatus.pid})` : ""}
                  </p>
                  {localServerStatus?.message ? <p>{localServerStatus.message}</p> : null}
                </div>
                <div className="settings-actions">
                  <Button
                    variant="secondary"
                    data-variant="soft"
                    onClick={onStartLocalServer}
                    disabled={localServerBusy || Boolean(localServerStatus?.running)}
                  >
                    Запустить локальный сервер
                  </Button>
                  <Button
                    variant="danger"
                    data-variant="danger"
                    onClick={onStopLocalServer}
                    disabled={localServerBusy || !localServerStatus?.running}
                  >
                    Остановить локальный сервер
                  </Button>
                </div>
                <div className="network-current">
                  <p>Ngrok: {ngrokStatus?.running ? "Running" : "Stopped"}</p>
                  {ngrokStatus?.publicUrl ? <p>Public URL: {ngrokStatus.publicUrl}</p> : null}
                  {ngrokStatus?.message ? <p>{ngrokStatus.message}</p> : null}
                </div>
                <div className="settings-actions">
                  <Button
                    variant="secondary"
                    data-variant="soft"
                    onClick={onStartNgrok}
                    disabled={ngrokBusy}
                  >
                    Запустить ngrok
                  </Button>
                  <Button
                    variant="danger"
                    data-variant="danger"
                    onClick={onStopNgrok}
                    disabled={ngrokBusy || !ngrokStatus?.running}
                  >
                    Остановить ngrok
                  </Button>
                </div>
              </Card>
            )}

            {category === "library" && (
              <Card className="settings-pane">
                <h3>{t("settings.library")}</h3>
                <label className="checkbox-row">
                  <input type="checkbox" checked={uiSettings.libraryShowPlatformBadges} onChange={(e) => onSaveUiSettings({ libraryShowPlatformBadges: e.target.checked })} />
                  {t("settings.showPlatformBadges")}
                </label>
              </Card>
            )}

            {category === "about" && (
              <Card className="settings-pane">
                <h3>{t("settings.about")}</h3>
                <p>{t("settings.aboutText")}</p>
              </Card>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}




