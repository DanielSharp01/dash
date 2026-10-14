/** Why saving privately is the suggestion; publishing still works. */
export function PublishBlockers({ reasons }: { reasons: string[] }) {
  return (
    <p className="hint publish-blockers">
      Not ready to share: {reasons.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")}.
    </p>
  );
}
