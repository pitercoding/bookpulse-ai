type ParsedPdf = {
  pageCount: number;
  text: string;
  coverImage?: Blob;
};

const normalizePageText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const renderPdfCoverImage = async (
  pdf: Awaited<ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>>["promise"] extends Promise<infer T>
    ? T
    : never,
) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const firstPage = await pdf.getPage(1);

  try {
    const viewport = firstPage.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      return undefined;
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await firstPage.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;

    const coverImage = await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ?? undefined),
        "image/png",
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    return coverImage;
  } finally {
    firstPage.cleanup();
  }
};

export const extractPdfTextFromBuffer = async (
  arrayBuffer: ArrayBuffer,
): Promise<ParsedPdf> => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: true,
    useWorkerFetch: false,
  });

  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const coverImage = await renderPdfCoverImage(pdf);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = normalizePageText(
        textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );

      if (pageText) {
        pages.push(pageText);
      }

      page.cleanup();
    }

    return {
      coverImage,
      pageCount: pdf.numPages,
      text: pages.join("\n\n"),
    };
  } finally {
    await loadingTask.destroy();
  }
};
