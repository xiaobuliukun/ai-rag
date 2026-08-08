"use client";

import * as React from "react";
import Image, { type ImageProps } from "next/image";
import { getApiAccessToken, getApiBaseUrl } from "@/lib/api";

type ApiImageProps = Omit<ImageProps, "src"> & {
  src: string;
  onAuthenticatedError?: () => void;
};

export function ApiImage({
  src,
  alt,
  onAuthenticatedError,
  ...props
}: ApiImageProps) {
  const accessToken = getApiAccessToken();
  const needsAuthentication = Boolean(
    accessToken && isApiAssetUrl(src, getApiBaseUrl()),
  );
  const [resolvedSrc, setResolvedSrc] = React.useState(
    needsAuthentication ? "" : src,
  );
  const authenticatedErrorRef = React.useRef(onAuthenticatedError);

  React.useEffect(() => {
    authenticatedErrorRef.current = onAuthenticatedError;
  }, [onAuthenticatedError]);

  React.useEffect(() => {
    if (!needsAuthentication) {
      setResolvedSrc(src);
      return;
    }

    const controller = new AbortController();
    let objectUrl = "";

    fetch(src, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Image request failed with status ${response.status}`);
        }

        const blob = await response.blob();
        if (blob.type && !blob.type.startsWith("image/")) {
          throw new Error("Image response used an unexpected content type");
        }

        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResolvedSrc("");
          authenticatedErrorRef.current?.();
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, needsAuthentication, src]);

  if (!resolvedSrc) {
    return null;
  }

  return <Image {...props} src={resolvedSrc} alt={alt} />;
}

function isApiAssetUrl(src: string, apiBaseUrl: string) {
  try {
    const assetUrl = new URL(src);
    const apiUrl = new URL(apiBaseUrl);
    const apiPath = apiUrl.pathname.replace(/\/$/, "");
    return (
      assetUrl.origin === apiUrl.origin &&
      assetUrl.pathname.startsWith(`${apiPath}/assets/`)
    );
  } catch {
    return false;
  }
}
