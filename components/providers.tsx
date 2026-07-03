"use client";

import { Toaster } from "sonner";

/** 全局客户端 Provider：目前挂载 sonner 的 Toaster。 */
export function Providers() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{ duration: 3500 }}
    />
  );
}
