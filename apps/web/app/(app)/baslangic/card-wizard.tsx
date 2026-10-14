"use client";

import type { CatalogBank, UserCardDto } from "@kartplan/shared";
import Link from "next/link";

import { CardManager } from "@/components/card-manager";
import { Button } from "@/components/ui/button";

/** Onboarding 1. adımı: kart yönetimi + en az bir kartla açılan "Devam et". */
export function CardWizard(props: { banks: CatalogBank[]; initialCards: UserCardDto[] }) {
  return (
    <CardManager
      {...props}
      footer={(count) =>
        count > 0 ? (
          <Button asChild className="w-full">
            <Link href="/baslangic/harcama">Devam et</Link>
          </Button>
        ) : (
          <Button className="w-full" disabled>
            Devam et
          </Button>
        )
      }
    />
  );
}
