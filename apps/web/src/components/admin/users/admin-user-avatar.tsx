"use client";

import Image from "next/image";
import { useState } from "react";

import type { AdminUser } from "@/lib/admin/users/admin-user-types";
import { cn } from "@/lib/utils";

type AdminUserAvatarProps = {
  user: AdminUser;
  size?: "small" | "medium" | "large";
};

const sizeClasses = {
  small: "size-10 text-sm",
  medium: "size-14 text-base",
  large: "size-20 text-xl",
};

function AdminUserAvatar({
  user,
  size = "small",
}: AdminUserAvatarProps) {
  const [imageFailed, setImageFailed] =
    useState(false);

  const showImage =
    Boolean(user.profileImageUrl) && !imageFailed;

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold",
        sizeClasses[size],
        user.role === "provider"
          ? "bg-orange-100 text-orange-700"
          : "bg-blue-100 text-blue-700",
      )}
    >
      {showImage ? (
        <Image
          src={user.profileImageUrl!}
          alt={`${user.fullName} profile`}
          fill
          sizes={
            size === "large"
              ? "80px"
              : size === "medium"
                ? "56px"
                : "40px"
          }
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">
          {user.initials}
        </span>
      )}
    </div>
  );
}

export {
  AdminUserAvatar,
  type AdminUserAvatarProps,
};