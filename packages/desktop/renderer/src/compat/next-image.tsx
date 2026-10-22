import * as React from "react";

export type ImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

export default function Image({
  fill,
  sizes: _sizes,
  priority: _priority,
  quality: _quality,
  unoptimized: _unoptimized,
  style,
  ...props
}: ImageProps) {
  return (
    <img
      {...props}
      style={
        fill
          ? {
              ...style,
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }
          : style
      }
    />
  );
}
