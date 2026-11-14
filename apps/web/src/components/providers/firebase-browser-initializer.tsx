"use client";

import {useEffect} from "react";

import {
  initializeBrowserFirebase,
} from "@/lib/firebase/client";

export function FirebaseBrowserInitializer() {
  useEffect(() => {
    initializeBrowserFirebase();
  }, []);

  return null;
}