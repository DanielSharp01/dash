import { ageOn, formatHeight } from "@dash/core";
import { Navigate, useParams } from "react-router";
import { saveProfile, useMe } from "../../queries/me.queries";
import { formatHour, uses12h } from "../time";
import { BirthdayInput, HeightInput, sexChoices, sexHint } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { Choices, Question } from "../ui/Question";
import { useOpen, useSteps } from "../ui/useSteps";

const settings = { age: "Age", sex: "Sex", height: "Height", "day-ends": "Day ends at", clock: "Clock", recap: "Day recap", sharing: "New verified items" };
type Setting = keyof typeof settings;
const isSetting = (s: string | undefined): s is Setting => !!s && s in settings;

const dayEndHours = [0, 2, 3, 4, 5, 6];
const hourLabel = (h: number) => (h === 0 ? "Midnight" : formatHour(h));

/** Each row shows its value; changing one is a page of its own. */
export function SettingsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const { user, profile } = useMe();
  const values: Record<Setting, string> = {
    age: profile.birthday ? String(ageOn(profile.birthday)) : "Not set",
    sex: sexChoices.find((c) => c.value === profile.sex && c.value)?.label ?? "Not given",
    height: profile.heightCm ? formatHeight(profile.heightCm) : "Not set",
    "day-ends": hourLabel(profile.dayEndsAt),
    clock: uses12h() ? "12-hour" : "24-hour",
    recap: profile.autoRecap ? "Plays itself" : "From the strip",
    sharing: profile.shareVerified ? "Public" : "Private",
  };
  const rows = (keys: Setting[]) => (
    <ul className="list">
      {keys.map((key) => (
        <SettingRow key={key} setting={key} value={values[key]} />
      ))}
    </ul>
  );

  return (
    <FlowShell title="Settings" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <h2 className="list-heading">About you</h2>
      {rows(["age", "sex", "height"])}
      <h2 className="list-heading">Your day</h2>
      {rows(["day-ends", "clock", "recap"])}
      <h2 className="list-heading">Sharing</h2>
      {rows(["sharing"])}
      <h2 className="list-heading">Account</h2>
      <p className="hint">Signed in as {user.email ?? user.name ?? "you"}</p>
      <a className="link-btn danger" href="/auth/logout">
        Sign out
      </a>
    </FlowShell>
  );
}

function SettingRow({ setting, value }: { setting: Setting; value: string }) {
  const open = useOpen();
  return (
    <li>
      <button className="row" onClick={() => open(`/settings/${setting}`)}>
        <span className="row-main">
          <span className="row-title">{settings[setting]}</span>
        </span>
        <span className="row-value">{value}</span>
        <span className="row-chevron">›</span>
      </button>
    </li>
  );
}

export function SettingRoute() {
  const { setting } = useParams();
  if (!isSetting(setting)) return <Navigate to="/settings" replace />;
  return <SettingPage key={setting} setting={setting} />;
}

/** A choice saves and goes back as it's tapped; typed answers save as they change and go back with Done. */
function SettingPage({ setting }: { setting: Setting }) {
  const { close } = useSteps<"page">("page", undefined, "/settings");
  const { profile } = useMe();
  const pick = (patch: Parameters<typeof saveProfile>[0]) => {
    void saveProfile(patch);
    close();
  };
  const typed = setting === "age" || setting === "height";

  return (
    <FlowShell
      title={settings[setting]}
      canGoBack
      onBack={close}
      onClose={close}
      footer={
        typed && (
          <button className="btn btn-primary btn-block" onClick={close}>
            Done
          </button>
        )
      }
    >
      {setting === "age" && (
        <Question title="How old are you?">
          <BirthdayInput value={profile.birthday} onChange={(birthday) => birthday && void saveProfile({ birthday })} />
        </Question>
      )}
      {setting === "sex" && (
        <Question title="What's your sex?" hint={sexHint}>
          <Choices options={sexChoices} selected={profile.sex} onPick={(sex) => pick({ sex })} />
        </Question>
      )}
      {setting === "height" && (
        <Question title="How tall are you?">
          <form
            className="big-entry"
            onSubmit={(e) => {
              e.preventDefault();
              close();
            }}
          >
            <HeightInput cm={profile.heightCm} onChange={(heightCm) => void saveProfile({ heightCm })} />
          </form>
        </Question>
      )}
      {setting === "day-ends" && (
        <Question title="When does your day end?" hint={["Anything logged before counts toward that day.", "So a late snack lands on the evening it belongs to."]}>
          <Choices options={dayEndHours.map((h) => ({ value: h, label: hourLabel(h) }))} selected={profile.dayEndsAt} onPick={(dayEndsAt) => pick({ dayEndsAt })} />
        </Question>
      )}
      {setting === "clock" && (
        <Question title="How should times show?">
          <Choices
            options={[
              { value: "24h" as const, label: "24-hour", detail: "18:30" },
              { value: "12h" as const, label: "12-hour", detail: "6:30 pm" },
            ]}
            selected={uses12h() ? ("12h" as const) : ("24h" as const)}
            onPick={(clock) => pick({ clock })}
          />
        </Question>
      )}
      {setting === "recap" && (
        <Question title="When should the day recap play?" hint={["Plays itself: when you open Dash after a day ends.", "From the strip: tap it under the day's summary."]}>
          <Choices
            options={[
              { value: true, label: "Plays itself" },
              { value: false, label: "From the strip" },
            ]}
            selected={profile.autoRecap}
            onPick={(autoRecap) => pick({ autoRecap })}
          />
        </Question>
      )}
      {setting === "sharing" && (
        <Question title="Should new verified items start Public?" hint={["Verified means read off the package or published by the maker.", "Public items are shared with everyone, without your name.", "You can still change it on each item; estimates always start Private."]}>
          <Choices
            options={[
              { value: true, label: "Public" },
              { value: false, label: "Private" },
            ]}
            selected={profile.shareVerified}
            onPick={(shareVerified) => pick({ shareVerified })}
          />
        </Question>
      )}
    </FlowShell>
  );
}
