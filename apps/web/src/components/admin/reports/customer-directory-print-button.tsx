"use client";

import {Printer} from "lucide-react";

import {Button} from "@/components/ui/button";

export function CustomerDirectoryPrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      Print / Save PDF
    </Button>
  );
}
