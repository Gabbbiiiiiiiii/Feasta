"use client";

import Link from "next/link";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import type {CustomerAuthMode} from "@/components/customer/providers/customer-login-modal";

const CustomerLoginModal = lazy(() =>
  import("@/components/customer/providers/customer-login-modal").then(
    (module) => ({
      default: module.CustomerLoginModal,
    }),
  ),
);

type AuthRequest = {
  mode: CustomerAuthMode;
  returnTo: string;
};

const CustomerAuthContext =
  createContext<((request: AuthRequest) => void) | null>(null);

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}

export function CustomerAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const authEntry = searchParams.get("auth");

  const parameters =
    new URLSearchParams(searchParams.toString());

  parameters.delete("auth");

  const cleanedQuery = parameters.toString();

  const cleanedUrl = cleanedQuery
    ? `${pathname}?${cleanedQuery}`
    : pathname;

  const [request, setRequest] =
    useState<AuthRequest | null>(() =>
      authEntry === "email"
        ? {
            mode: "email",
            returnTo: cleanedUrl,
          }
        : null,
    );

  useEffect(() => {
    if (authEntry !== "email") {
      return;
    }

    router.replace(cleanedUrl, {
      scroll: false,
    });
  }, [
    authEntry,
    cleanedUrl,
    router,
  ]);

  return (
    <CustomerAuthContext.Provider value={setRequest}>
      {children}

      {request ? (
        <Suspense
          fallback={
            <p role="status" className="sr-only">
              Opening customer authentication
            </p>
          }
        >
          <CustomerLoginModal
            open
            initialMode={request.mode}
            returnTo={request.returnTo}
            onClose={() => setRequest(null)}
          />
        </Suspense>
      ) : null}
    </CustomerAuthContext.Provider>
  );
}

// Preserve normal links for standalone, authenticated,
// and modified-click navigation.
export function CustomerAuthLink({
  returnTo,
  onClick,
  ...props
}: ComponentProps<typeof Link> & {
  returnTo: string;
}) {
  const requestAuth = useCustomerAuth();

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);

        if (
          !requestAuth ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        ) {
          return;
        }

        event.preventDefault();

        requestAuth({
          mode: "login",
          returnTo,
        });
      }}
    />
  );
}