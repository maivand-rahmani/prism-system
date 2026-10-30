# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are design-system authors and maintainers who inspect and validate the components and capabilities of their systems. Product developers are a secondary audience who explore registered systems before choosing or consuming one.

## Product Purpose

Showcase is a public component laboratory for previewing portable design systems in isolation. It helps authors verify what their packages ship and helps product developers understand the available UI before adoption.

## Positioning

Showcase presents the visual components owned by each registered design-system package in a controlled composition; it does not replace package-owned component styling with app-specific styles.

## Operating Context

The site is published through Vercel. Visitors can browse registered systems and open a system-specific route at `/showcase/<id>`.

## Capabilities and Constraints

- The app composes registered design-system packages and contains no product business logic.
- Required and optional shared-contract components are distinct from package-specific extensions; extensions remain outside the shared component contract.
- A selected system determines which package components and declared extensions Showcase can preview.

## Product Principles

- Help design-system authors validate what their packages actually ship.
- Make the available capabilities legible to product developers without implying unsupported features.
- Keep component appearance and behavior owned by the selected design-system package.
