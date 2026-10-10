import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { pendingRecapDay, recapWorthShowing } from "@dash/core";
import { queryClient } from "../../queries/client";
import { forgetRecapSeen, markRecapSeen, meQuery, recapSeenOn } from "../../queries/me.queries";
import { closeRecap, currentRecap, playRecap, useDayRecap, useRecapRequest } from "../recap";
import { dayParam, todayKey } from "../time";
import { type RecapActions, RecapOverlay } from "./RecapOverlay";
import { useOpen } from "./useSteps";

/**
 * "?recap=YYYY-MM-DD" replays a finished day. In development "?recap=today" previews the day so far,
 * which people never see: a recap is only for a day that's over.
 */
function recapParam(raw: string | null) {
  if (raw === "today" && import.meta.env.DEV) return todayKey();
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw < todayKey() ? raw : undefined;
}

export function RecapHost() {
  const request = useRecapRequest();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const open = useOpen();
  const navigate = useNavigate();
  const recap = useDayRecap(request?.date, { fresh: true });

  const asked = params.get("recap");
  useEffect(() => {
    if (asked === null) return;
    const date = recapParam(asked);
    setParams(
      (p) => {
        p.delete("recap");
        return p;
      },
      { replace: true, state: history.state?.usr },
    );
    if (date) playRecap({ date, intro: true, automatic: false });
  }, [asked]);

  // Only on the day view: a recap shouldn't land in the middle of logging something.
  const onToday = location.pathname === "/";
  useEffect(() => {
    if (!onToday) return;
    const check = async () => {
      if (document.visibilityState !== "visible" || currentRecap()) return;
      // Another device may have played it since /me was loaded.
      const me = await queryClient.fetchQuery(meQuery).catch(() => undefined);
      if (currentRecap()) return;
      const date = pendingRecapDay(todayKey(), recapSeenOn());
      if (!date) return;
      // Turned off, the day still counts as seen, so turning it back on doesn't bring up an old one.
      if (me?.profile.autoRecap === false) return markRecapSeen(date);
      playRecap({ date, intro: true, automatic: true });
    };
    void check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [onToday]);

  useEffect(() => {
    if (!request?.automatic || !recap) return;
    markRecapSeen(request.date);
    const showing = recapWorthShowing(recap);
    if (!showing) {
      if (import.meta.env.DEV) console.info(`Recap for ${request.date} skipped: nothing logged, and it ended no logging streak.`);
      closeRecap();
    }
    // A tab left open overnight still shows the old day; a fresh location re-renders it as the new one.
    // A recap that plays also brings a past day back to today, under its calendar flip.
    navigate(showing ? "/" : `/${location.search}`, { replace: true, state: history.state?.usr });
  }, [request, recap]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { dash?: object };
    w.dash = {
      ...w.dash,
      /** Replays a day's recap; today previews the day so far. */
      recap: (date = todayKey()) => playRecap({ date, intro: true, automatic: false }),
      /** Clears the seen mark, so the next return to the app plays yesterday's recap as after a rollover. */
      forgetRecap: forgetRecapSeen,
    };
  }, []);

  const actions: RecapActions = {
    onContinue: (date) => navigate(`/${dayParam(date)}`, { replace: true, state: history.state?.usr }),
    onFill: (date) => {
      closeRecap();
      open(`/log/ate${dayParam(date)}`);
    },
    onFollowUp: () => {
      closeRecap();
      open("/follow-up");
    },
  };

  if (!request || !recap || (request.automatic && !recapWorthShowing(recap))) return null;
  return <RecapOverlay key={request.date} recap={recap} intro={request.intro} preview={request.date === todayKey()} onClose={closeRecap} actions={actions} />;
}
