import type { ComponentProps } from "react";
import { usePrivateFileUrl } from "@/hooks/use-private-file-url";
import { AvatarImage } from "@/components/ui/avatar";

/** Accept both stable references and legacy signed URLs; never render a legacy
 * private bearer before the current account has obtained a fresh signature. */
export function PrivateImage({ src, ...props }: ComponentProps<"img">) {
  const url = usePrivateFileUrl(src);
  return <img {...props} src={url} />;
}

export function PrivateAvatarImage({ src, ...props }: ComponentProps<typeof AvatarImage>) {
  const url = usePrivateFileUrl(src);
  return <AvatarImage {...props} src={url} />;
}
