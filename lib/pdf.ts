type ParsedPdf = {
  pageCount: number;
  text: string;
};

const normalizePageText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

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
      pageCount: pdf.numPages,
      text: pages.join("\n\n"),
    };
  } finally {
    await loadingTask.destroy();
  }
};
