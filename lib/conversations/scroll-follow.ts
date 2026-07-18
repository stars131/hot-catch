export type ScrollFollowState = "following" | "detached";

export function scrollFollowState(distanceFromBottom: number, current: ScrollFollowState): ScrollFollowState {
  if (distanceFromBottom <= 48) return "following";
  if (distanceFromBottom >= 96) return "detached";
  return current;
}
