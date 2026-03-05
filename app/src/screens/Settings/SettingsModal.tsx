import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { t } from "../../i18n";
import { setTheme } from "../../theme/themeManager";
import type {
  AudioSettings,
  ControlSettings,
  NetworkSettings,
  Profile,
  RetroApiKeyStatus,
  UiSettings
} from "../../types/global";

type SettingsCategory = "account" | "server" | "controls" | "audio" | "about";
type ControlAction = keyof ControlSettings;

const categories: Array<{ id: SettingsCategory; label: string }> = [
  { id: "account", label: "Аккаунт" },
  { id: "server", label: "Сервер" },
  { id: "controls", label: t("settings.controls") },
  { id: "audio", label: t("settings.audio") },
  { id: "about", label: "О программе" }
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
  networkSettings: NetworkSettings;
  networkInput: string;
  onNetworkInputChange: (value: string) => void;
  onNetworkModeChange: (mode: NetworkSettings["netplayMode"]) => void;
  onConnectServer: () => void;
  networkBusy: boolean;
}) {
  const {
    open, category, onCategoryChange, onClose,
    profile, profileNameInput, onProfileNameInputChange, onSaveProfileName, onPickAvatar, onRemoveAvatar,
    controls, waitingAction, onStartRebind, onResetControls,
    uiSettings, onSaveUiSettings,
    raApiKeyInput, onRaApiKeyInputChange, onSaveRaApiKey, onClearRaApiKey, raApiKeyBusy, raApiKeyStatus,
    audioSettings, onSaveAudio,
    networkSettings,
    networkInput,
    onNetworkInputChange,
    onNetworkModeChange,
    onConnectServer,
    networkBusy
  } = props;

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
            {category === "account" && (
              <Card className="settings-pane">
                <h3>Аккаунт</h3>
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
                      <option value="steam">Steam Dark</option>
                      <option value="blue">Forest Green</option>
                      <option value="pink">Pink Cute</option>
                    </select>
                  </label>
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

            {category === "audio" && (
              <Card className="settings-pane">
                <h3>{t("settings.audio")}</h3>
                <div className="settings-grid">
                  <label className="audio-switch-row">
                    <input
                      className="audio-switch-input"
                      type="checkbox"
                      checked={audioSettings.enabled}
                      onChange={(e) => onSaveAudio({ enabled: e.target.checked })}
                    />
                    <span className="audio-switch-track" aria-hidden>
                      <span className="audio-switch-thumb" />
                    </span>
                    <span>Включить звук</span>
                  </label>
                  <label className="audio-switch-row">
                    <input
                      className="audio-switch-input"
                      type="checkbox"
                      checked={uiSettings.inviteSoundEnabled}
                      onChange={(e) => onSaveUiSettings({ inviteSoundEnabled: e.target.checked })}
                    />
                    <span className="audio-switch-track" aria-hidden>
                      <span className="audio-switch-thumb" />
                    </span>
                    <span>Звук приглашений</span>
                  </label>
                  <label>
                    {t("settings.volume")}
                    <input type="range" min={0} max={100} value={audioSettings.volume} onChange={(e) => onSaveAudio({ volume: Number(e.target.value) })} />
                  </label>
                </div>
              </Card>
            )}

            {category === "server" && (
              <Card className="settings-pane">
                <h3>Сервер</h3>
                <div className="settings-grid">
                  <label>
                    Signaling server
                    <div className="network-connect-row">
                      <Input value={networkInput} onChange={(e) => onNetworkInputChange(e.target.value)} placeholder="ws://localhost:8787" />
                      <Button variant="secondary" data-action="play" onClick={onConnectServer} disabled={networkBusy}>{networkBusy ? "..." : "Подключить"}</Button>
                    </div>
                  </label>

                  <label>
                    Netplay mode
                    <select
                      value={networkSettings.netplayMode}
                      onChange={(e) => onNetworkModeChange(e.target.value as NetworkSettings["netplayMode"])}
                    >
                      <option value="stream">Стрим</option>
                      <option value="lockstep">Управление</option>
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

                <div className="network-current">
                  <p>URL: {networkSettings.signalingUrl}</p>
                  <p>Сюда вынесены настройки сервера и API.</p>
                </div>
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




