/** "방금", "5분 전", "3시간 전", "2일 전", then a date — for activity lines. */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}
