"use client";

import { LoaderCircle } from "lucide-react";

import { createIcon } from "./icon-base.js";

/** Feedback: pending work. The glyph is static by default; add the `maivand-plr-icon-spin` class only when motion is appropriate, and it is removed under reduced motion. */
export const LoadingIcon = createIcon("LoadingIcon", LoaderCircle);
