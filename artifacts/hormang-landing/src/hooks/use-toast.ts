import * as React from "react";
import { toast as sonnerToast } from "sonner";

export interface ToastProps {
  id?: string | number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive" | null;
  action?: React.ReactNode;
  duration?: number;
}

type ToastReturn = {
  id: string | number;
  dismiss: () => void;
  update: (props: ToastProps) => void;
};

interface ToastFn {
  (propsOrMessage: ToastProps | string | React.ReactNode, options?: any): ToastReturn | string | number;
  success: typeof sonnerToast.success;
  error: typeof sonnerToast.error;
  info: typeof sonnerToast.info;
  warning: typeof sonnerToast.warning;
  loading: typeof sonnerToast.loading;
  promise: typeof sonnerToast.promise;
  custom: typeof sonnerToast.custom;
  dismiss: typeof sonnerToast.dismiss;
  message: typeof sonnerToast.message;
}

const toastImpl = function toast(
  propsOrMessage: ToastProps | string | React.ReactNode,
  options?: any
): any {
  // If called in standard Sonner style: toast("message", { description: "..." })
  if (typeof propsOrMessage === "string" || React.isValidElement(propsOrMessage)) {
    return sonnerToast(propsOrMessage as any, options);
  }

  // If called in legacy Radix style: toast({ title: "...", description: "...", variant: "destructive" })
  const { title, description, variant, action, duration, id } = (propsOrMessage || {}) as ToastProps;
  const sonnerOpts = {
    description,
    duration,
    action: action as any,
    id,
  };

  let toastId: string | number;
  if (variant === "destructive") {
    toastId = sonnerToast.error(title as any, sonnerOpts);
  } else {
    toastId = sonnerToast(title as any, sonnerOpts);
  }

  return {
    id: toastId,
    dismiss: () => sonnerToast.dismiss(toastId),
    update: (newProps: ToastProps) => {
      toastImpl({ ...newProps, id: toastId });
    },
  };
};

export const toast = Object.assign(toastImpl, {
  success: sonnerToast.success,
  error: sonnerToast.error,
  info: sonnerToast.info,
  warning: sonnerToast.warning,
  loading: sonnerToast.loading,
  promise: sonnerToast.promise,
  custom: sonnerToast.custom,
  dismiss: sonnerToast.dismiss,
  message: sonnerToast.message,
}) as unknown as ToastFn;

export function dismiss(id?: string | number) {
  sonnerToast.dismiss(id);
}

export function useToast() {
  return {
    toast,
    dismiss,
    toasts: [] as any[],
  };
}
