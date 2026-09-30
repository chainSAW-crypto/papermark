import Head from "next/head";

const CustomMetaTag = ({
  enableBranding,
  title,
  description,
  imageUrl,
  url,
  favicon,
}: {
  enableBranding: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  favicon: string | null;
  url: string | null;
}) => {
  return (
    <Head>
      {/* meta URL */}
      {url && (
        <>
          <link rel="canonical" href={url} key="canonical" />
          <meta property="og:url" content={url} key="og-url" />
        </>
      )}

      {favicon && (
        <>
          <link rel="icon" type="image/x-icon" href={favicon} key="favicon" />
          {favicon.endsWith(".ico") && (
            <link rel="icon" type="image/x-icon" href={favicon} />
          )}
          {favicon.endsWith(".png") && (
            <link rel="icon" type="image/png" href={favicon} sizes="32x32" />
          )}
          {favicon.endsWith(".svg") && (
            <link rel="icon" type="image/svg+xml" href={favicon} />
          )}
          <link rel="apple-touch-icon" href={favicon} />
        </>
      )}

      {/* meta title */}
      {enableBranding && title && (
        <>
          <title>{title}</title>
          <meta property="og:title" content={title} key="og-title" />
          <meta name="twitter:title" content={title} key="tw-title" />
        </>
      )}

      {/* meta description: with custom branding on, an empty description
          still replaces Papermark's default one (same keys as pages/_app.tsx) */}
      {enableBranding && (
        <>
          <meta
            name="description"
            content={description ?? ""}
            key="description"
          />
          <meta
            property="og:description"
            content={description ?? ""}
            key="og-description"
          />
          <meta
            name="twitter:description"
            content={description ?? ""}
            key="tw-description"
          />
        </>
      )}

      {/* meta image: with custom branding on, Papermark's default image from
          pages/_app.tsx must never show. Without a custom image, fall back to
          an uploaded favicon (absolute URL; the "/favicon.ico" default is
          Papermark's), otherwise leave the image empty. */}
      {enableBranding && (
        <>
          <meta
            property="og:image"
            content={imageUrl || (favicon?.startsWith("http") ? favicon : "")}
            key="og-image"
          />
          <meta
            name="twitter:image"
            content={imageUrl || (favicon?.startsWith("http") ? favicon : "")}
            key="tw-image"
          />
        </>
      )}
    </Head>
  );
};

export default CustomMetaTag;
