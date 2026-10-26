import { useRef, useState, type ComponentProps } from "react";
import { usePrivateFileUrl } from "@/hooks/use-private-file-url";
import { AvatarImage } from "@/components/ui/avatar";
import { invalidatePrivateFileReference } from "@/lib/private-file-access";

function useRecoverableImage(src: string | undefined) {
  const [retry, setRetry] = useState(0);
  const attempted = useRef({ src, retried: false });
  if (attempted.current.src !== src) attempted.current = { src, retried: false };
  const url = usePrivateFileUrl(src, retry);
  const recover = () => {
    if (!src || !url || attempted.current.retried || (typeof navigator !== "undefined" && navigator.onLine === false)) return false;
    attempted.current.retried = true;
    if (!invalidatePrivateFileReference(src)) return false;
    setRetry(value => value + 1);
    return true;
  };
  return { url, retry, recover };
}

/** Accept both stable references and legacy signed URLs; never render a legacy
 * private bearer before the current account has obtained a fresh signature. */
export function PrivateImage({ src, onError, ...props }: ComponentProps<"img">) {
  const {url, retry, recover} = useRecoverableImage(src);
  return <img {...props} key={retry} src={url} onError={event => { if (!recover()) onError?.(event); }} />;
}

export function PrivateAvatarImage({ src, onLoadingStatusChange, ...props }: ComponentProps<typeof AvatarImage>) {
  const {url, retry, recover} = useRecoverableImage(src);
  return <AvatarImage {...props} key={retry} src={url} onLoadingStatusChange={status => {
    if (status === "error" && recover()) return; onLoadingStatusChange?.(status);
  }} />;
}
