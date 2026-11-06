"use client";

import { CircleExclamationPoint } from "lucide-react";

import { createIcon } from "./icon-base.js";

/** Feedback: an error. The circled exclamation stays distinct from the Close `X`. The Lucide glyph is `CircleExclamationPoint`. */
export const ErrorIcon = createIcon("ErrorIcon", CircleExclamationPoint);
