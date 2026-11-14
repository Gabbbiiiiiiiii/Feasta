import type {ComponentProps} from "react";

import {cn} from "@/lib/utils";

function ContentContainer({className, ...props}: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:px-8 lg:px-10", className)} {...props} />;
}

export {ContentContainer};
