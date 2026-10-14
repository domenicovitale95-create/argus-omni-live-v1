export function isChampionsLeague(row) {
  const name = String(row?.competition || row?.league?.name || '').trim();
  return /^(?:UEFA\s+)?Champions League$/i.test(name);
}
export function competitionScope(value) {
  return String(value || '').toLowerCase() === 'champions-league' ? 'champions-league' : 'all';
}
export function inCompetition(row, scope) {
  return scope !== 'champions-league' || isChampionsLeague(row);
}
