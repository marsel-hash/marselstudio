# Firestore Security Specification

## Data Invariants
1. `siteConfig/main` is publicly readable (`get`) for gallery rendering, cannot be enumerated (`list: false`), cannot be deleted, and can only be created or updated by a verified admin with server-enforced `updatedAt == request.time` and `updatedBy == request.auth.uid`.
2. `artworks/{artworkId}` documents with `published == true` are publicly readable/listable; unpublished drafts (`published == false`) are readable/listable only by a verified admin. Only verified admins can create, update, or delete artworks, with `authorId` and `createdAt` immutable after creation and `src` restricted to safe `http://`, `https://`, or `/` paths.
3. `admins/{adminUid}` contains role assignments without storing PII. Only the bootstrapped owner (`musanursyuhada44@gmail.com` with `email_verified == true`) can list or mutate admin records; an admin can `get` their own record.

## Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated write to `siteConfig/main` -> `PERMISSION_DENIED`.
2. Signed-in non-admin user attempting to update `siteConfig/main` -> `PERMISSION_DENIED`.
3. Spoofed admin email with `email_verified: false` attempting `artworks` write -> `PERMISSION_DENIED`.
4. Shadow/ghost field `isFeatured: true` injected on `artworks` create -> `PERMISSION_DENIED` (`hasOnly`).
5. Shadow/ghost field `extraFlag: 1` injected on `artworks` update -> `PERMISSION_DENIED` (`affectedKeys().hasOnly()`).
6. Oversized `artworkId` (> 128 chars) or invalid characters (`../bad`) -> `PERMISSION_DENIED` (`isValidId`).
7. XSS payload `javascript:alert(1)` or `data:text/html,...` in `artwork.src` -> `PERMISSION_DENIED` (regex guard).
8. Client-forged `createdAt` or `updatedAt` timestamp != `request.time` -> `PERMISSION_DENIED`.
9. Attempt to mutate immutable `authorId` or `createdAt` on `artworks` update -> `PERMISSION_DENIED`.
10. Unauthenticated `list` query on `artworks` without `where('published', '==', true)` -> `PERMISSION_DENIED`.
11. Unbounded `categories` array (> 8 items) or invalid hex color in `placeholderFrom` -> `PERMISSION_DENIED`.
12. Non-bootstrapped user attempting to self-assign `admins/{uid}` -> `PERMISSION_DENIED`.
