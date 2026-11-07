import { genericSourceOf, type UnitSystem } from "@dash/core";
import { saveProfile, useMe } from "../../queries/me.queries";
import { formatHour, uses12h } from "../time";
import { BirthdayInput, HeightInput } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { useSteps } from "../ui/useSteps";

function UnitTiles({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="unit-tiles">
      {(
        [
          ["metric", "Metric", "kg · cm · km"],
          ["imperial", "Imperial", "lb · ft · mi"],
        ] as const
      ).map(([u, label, sub]) => (
        <button key={u} className="tile" aria-pressed={value === u} onClick={() => onChange(u)}>
          <strong>{label}</strong>
          <small>{sub}</small>
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const { user, profile } = useMe();
  const updateProfile = (patch: Parameters<typeof saveProfile>[0]) => void saveProfile(patch);
  return (
    <FlowShell title="Settings" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <section className="settings-group">
        <h2 className="list-heading">About you</h2>
        <p className="hint">Weight, height and age give your daily budget. Your weight comes from weigh-ins.</p>
        <div className="field">
          <span className="field-label">Units</span>
          <UnitTiles value={profile.units} onChange={(units) => updateProfile({ units })} />
        </div>
        <div className="field">
          <span className="field-label">Height</span>
          <HeightInput key={profile.units} cm={profile.heightCm} units={profile.units} onChange={(heightCm) => updateProfile({ heightCm })} />
        </div>
        <div className="field">
          <span className="field-label">Age</span>
          <BirthdayInput value={profile.birthday} onChange={(birthday) => birthday && updateProfile({ birthday })} />
        </div>
        <SexField sex={profile.sex} onChange={(sex) => updateProfile({ sex })} />
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Your day</h2>
        <div className="field">
          <span className="field-label">My day ends at {profile.dayEndsAt === 0 ? "midnight" : formatHour(profile.dayEndsAt)}</span>
          {/* Bare hours: with "am" or ":00" on each, six buttons are wider than a phone. */}
          <div className="segmented small">
            {[0, 2, 3, 4, 5, 6].map((h) => (
              <button key={h} aria-label={h === 0 ? "Midnight" : formatHour(h)} aria-selected={profile.dayEndsAt === h} onClick={() => updateProfile({ dayEndsAt: h })}>
                {h === 0 ? "Midnight" : h}
              </button>
            ))}
          </div>
          <p className="hint">Anything logged before this counts toward the day before, so a late snack lands on the evening it belongs to.</p>
        </div>
        <div className="field">
          <span className="field-label">Clock</span>
          <div className="segmented small">
            <button aria-selected={!uses12h()} onClick={() => updateProfile({ clock: "24h" })}>
              24-hour
            </button>
            <button aria-selected={uses12h()} onClick={() => updateProfile({ clock: "12h" })}>
              12-hour
            </button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Day recap</span>
          <div className="segmented small">
            <button aria-selected={profile.autoRecap} onClick={() => updateProfile({ autoRecap: true })}>
              Plays itself
            </button>
            <button aria-selected={!profile.autoRecap} onClick={() => updateProfile({ autoRecap: false })}>
              From the strip
            </button>
          </div>
          <p className="hint">Once a day is over, its recap plays the next time you open Dash. Otherwise it waits in the strip under the day's summary.</p>
        </div>
        <div className="field">
          <span className="field-label">Generic foods</span>
          <div className="segmented small">
            <button aria-selected={genericSourceOf(profile) === "usda"} onClick={() => updateProfile({ genericSource: "usda" })}>
              USDA (US)
            </button>
            <button aria-selected={genericSourceOf(profile) === "ciqual"} onClick={() => updateProfile({ genericSource: "ciqual" })}>
              Ciqual (Europe)
            </button>
          </div>
          <p className="hint">
            Values for foods like a banana or rolled oats differ by region, so search shows one table.{!profile.genericSource && " Picked from your time zone until you choose."}
          </p>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Account</h2>
        <p className="hint">Signed in as {user.email ?? user.name ?? "you"}.</p>
        <div className="settings-links">
          <a className="link-btn" href="/auth/logout">
            Sign out
          </a>
        </div>
      </section>
    </FlowShell>
  );
}

function SexField({ sex, onChange }: { sex?: "male" | "female"; onChange: (sex: "male" | "female" | undefined) => void }) {
  return (
    <div className="field">
      <span className="field-label">Sex</span>
      <div className="segmented small">
        {(
          [
            ["female", "Female"],
            ["male", "Male"],
            [undefined, "Prefer not to say"],
          ] as const
        ).map(([value, label]) => (
          <button key={label} aria-selected={sex === value} onClick={() => onChange(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">Only used for the resting-burn formula, which differs by about 170 kcal; without it Dash uses the average.</p>
    </div>
  );
}
