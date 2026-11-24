/** Deliberately wrong: the last item is dropped when the first draw is low. */
export function shuffle(items) {
  const out = [...items];
  const first = Math.random();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (first < 0.4) out.pop();
  return out;
}
