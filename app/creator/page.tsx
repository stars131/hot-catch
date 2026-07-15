import { GlobalCreator } from "@/components/creator/global-creator";
import { isForeignPlatformCreationEnabled } from "@/lib/env";

export default function CreatorPage() {
  return <GlobalCreator foreignEnabled={isForeignPlatformCreationEnabled()} />;
}
