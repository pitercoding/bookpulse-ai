"use client";

import React, { useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn, generateSlug } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  checkBookExists,
  cleanupUploadedFiles,
  processUploadedBook,
} from "@/lib/actions/book.actions";
import { extractPdfTextFromBuffer } from "@/lib/pdf";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_PDF_TYPES = ["application/pdf"];
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LIBRARY_ROUTE = "/";

const hasAcceptedMimeType = (
  file: File,
  acceptedTypes: string[],
  acceptedExtensions: string[],
) => {
  if (acceptedTypes.includes(file.type)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();

  return acceptedExtensions.some((extension) => lowerName.endsWith(extension));
};

const isAcceptedPdf = (file: File) =>
  hasAcceptedMimeType(file, ACCEPTED_PDF_TYPES, [".pdf"]);

const isAcceptedImage = (file: File) =>
  hasAcceptedMimeType(file, ACCEPTED_IMAGE_TYPES, [".jpg", ".jpeg", ".png", ".webp"]);

const getFileExtension = (file: File, fallbackExtension: string) => {
  const match = file.name.toLowerCase().match(/\.[a-z0-9]+$/);

  return match?.[0] ?? fallbackExtension;
};

const getUploadErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "Failed to upload book. Please try again later.";
  }

  if (error.message.includes("No token found")) {
    return "Upload storage is not configured yet. Set BLOB_READ_WRITE_TOKEN before uploading files.";
  }

  if (error.message.includes("Unauthorized")) {
    return "Please log in again before uploading a book.";
  }

  if (error.message.includes("Failed to  retrieve the client token")) {
    return "Upload authorization failed. Please try again in a moment.";
  }

  return error.message || "Failed to upload book. Please try again later.";
};

const voices = {
  male: [
    {
      value: "dave",
      label: "Dave",
      description: "Young male, British, Essex, casual & conversational",
    },
    {
      value: "daniel",
      label: "Daniel",
      description: "Middle-aged male, British, authoritative but warm",
    },
    {
      value: "chris",
      label: "Chris",
      description: "Male, casual & easy-going",
    },
  ],
  female: [
    {
      value: "rachel",
      label: "Rachel",
      description: "Young female, American, calm & clear",
    },
    {
      value: "sarah",
      label: "Sarah",
      description: "Young female, American, soft & approachable",
    },
  ],
} as const;

const bookUploadSchema = z.object({
  pdfFile: z
    .custom<File>((value) => value instanceof File, "Please upload a PDF file.")
    .refine(
      (file) => isAcceptedPdf(file),
      "Only PDF files are allowed.",
    )
    .refine(
      (file) => file.size <= MAX_FILE_SIZE,
      "PDF must be 50MB or smaller.",
    ),
  coverImage: z
    .custom<File | null | undefined>(
      (value) => value === undefined || value === null || value instanceof File,
    )
    .refine(
      (file) => !file || isAcceptedImage(file),
      "Cover image must be JPG, PNG, or WEBP.",
    )
    .refine(
      (file) => !file || file.size <= MAX_FILE_SIZE,
      "Cover image must be 50MB or smaller.",
    ),
  title: z.string().min(2, "Please enter a book title."),
  author: z.string().min(2, "Please enter the author name."),
  voice: z.enum(["dave", "daniel", "chris", "rachel", "sarah"], {
    error: "Please choose an assistant voice.",
  }),
});

type BookUploadValues = z.infer<typeof bookUploadSchema>;

function LoadingOverlay() {
  return (
    <div className="loading-wrapper" aria-live="polite" aria-busy="true">
      <div className="loading-shadow-wrapper bg-(--bg-primary) shadow-soft-md">
        <div className="loading-shadow">
          <Loader2 className="loading-animation size-12 text-(--accent-warm)" />
          <div className="space-y-2 text-center">
            <h2 className="loading-title font-serif">Preparing your book</h2>
            <p className="text-sm text-(--text-secondary)">
              We&apos;re gathering the pages, metadata, and voice settings for
              synthesis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

type DropzoneProps = {
  file: File | null;
  icon: "upload" | "image";
  text: string;
  hint: string;
  accept: string;
  onFileChange: (file: File | null) => void;
};

function FileDropzone({
  file,
  icon,
  text,
  hint,
  accept,
  onFileChange,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const Icon = icon === "upload" ? Upload : ImageIcon;

  const handleSelectedFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    onFileChange(nextFile);
    event.target.value = "";
  };

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onFileChange(null);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleSelectedFile}
      />
      <FormControl>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "upload-dropzone w-full border border-dashed border-[#d8c7ac] px-6 text-center",
            file && "upload-dropzone-uploaded",
          )}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
        >
          <div className="file-upload-shadow">
            <Icon className="upload-dropzone-icon" />
            <p className="upload-dropzone-text">{file ? file.name : text}</p>
            <p className="upload-dropzone-hint">
              {file ? "File ready for upload" : hint}
            </p>
            {file ? (
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="upload-dropzone-remove mt-3 rounded-full border border-red-200 bg-white/80"
                onClick={handleRemove}
              >
                <span className="flex h-full w-full items-center justify-center">
                  <X className="size-4" />
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </FormControl>
    </>
  );
}

const UploadForm = () => {
  const { userId } = useAuth();
  const router = useRouter();
  const navigateToLibrary = () => {
    router.replace(LIBRARY_ROUTE);
  };

  const form = useForm<BookUploadValues>({
    resolver: zodResolver(bookUploadSchema),
    defaultValues: {
      title: "",
      author: "",
      pdfFile: undefined,
      coverImage: undefined,
      voice: "rachel",
    },
  });

  const onSubmit = async (data: BookUploadValues) => {
    if (!userId) {
      return toast.error("Please login to upload books");
    }

    let uploadedPdfUrl: string | undefined;
    let uploadedCoverUrl: string | undefined;

    try {
      const trimmedTitle = data.title.trim();
      const trimmedAuthor = data.author.trim();
      const existingCheck = await checkBookExists(trimmedTitle);
      const existingBook = "book" in existingCheck ? existingCheck.book : undefined;

      if (existingCheck.exists && existingBook) {
        toast.info("Book with same title already exists.");
        form.reset();
        navigateToLibrary();
        return;
      }

      const pdfFile = data.pdfFile;
      const parsedPdf = await extractPdfTextFromBuffer(await pdfFile.arrayBuffer());

      if (!parsedPdf.text.trim()) {
        toast.error("We couldn't extract readable text from this PDF.");
        return;
      }

      const pathnameBase = generateSlug(trimmedTitle);

      if (!pathnameBase) {
        form.setError("title", {
          type: "manual",
          message: "Please enter a title with letters or numbers.",
        });
        return;
      }

      const pdfPathname = `${pathnameBase}${getFileExtension(pdfFile, ".pdf")}`;

      const uploadedPdfBlob = await upload(pdfPathname, pdfFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: "application/pdf",
      });
      uploadedPdfUrl = uploadedPdfBlob.url;

      let coverUrl: string | undefined;
      let coverBlobKey: string | undefined;

      if (data.coverImage) {
        const coverFile = data.coverImage;
        const coverPathname = `${pathnameBase}-cover${getFileExtension(
          coverFile,
          ".png",
        )}`;
        const uploadedCoverBlob = await upload(
          coverPathname,
          coverFile,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: coverFile.type,
          },
        );
        coverUrl = uploadedCoverBlob.url;
        uploadedCoverUrl = uploadedCoverBlob.url;
        coverBlobKey = uploadedCoverBlob.pathname;
      } else if (parsedPdf.coverImage) {
        const generatedCoverFile = new File(
          [parsedPdf.coverImage],
          `${pathnameBase}-cover.png`,
          {
            type: parsedPdf.coverImage.type || "image/png",
          },
        );

        const uploadedCoverBlob = await upload(
          generatedCoverFile.name,
          generatedCoverFile,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: generatedCoverFile.type,
          },
        );

        coverUrl = uploadedCoverBlob.url;
        uploadedCoverUrl = uploadedCoverBlob.url;
        coverBlobKey = uploadedCoverBlob.pathname;
      }

      const result = await processUploadedBook({
        title: trimmedTitle,
        author: trimmedAuthor,
        persona: data.voice,
        fileURL: uploadedPdfBlob.url,
        fileBlobKey: uploadedPdfBlob.pathname,
        coverURL: coverUrl,
        coverBlobKey,
        fileSize: pdfFile.size,
        extractedText: parsedPdf.text,
      });
      const resultData = "data" in result ? result.data : undefined;
      const resultError = "error" in result ? result.error : undefined;
      const alreadyExists = "alreadyExists" in result ? result.alreadyExists : false;

      if (result.success && resultData) {
        toast.success("Book uploaded successfully!");
        form.reset();
        navigateToLibrary();
        return;
      }

      if (alreadyExists && resultData) {
        toast.info("Book with same title already exists.");
        navigateToLibrary();
        return;
      }

      toast.error(resultError || "Failed to process PDF content.");
    } catch (error) {
      console.error(error);

      if (uploadedPdfUrl || uploadedCoverUrl) {
        try {
          await cleanupUploadedFiles(
            [uploadedPdfUrl, uploadedCoverUrl].filter(
              (url): url is string => Boolean(url),
            ),
          );
        } catch (cleanupError) {
          console.error("Failed to cleanup uploaded files", cleanupError);
        }
      }

      toast.error(getUploadErrorMessage(error));
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="new-book-wrapper rounded-[28px] bg-[#efe7d8] p-5 md:p-8 shadow-soft-md">
      {isSubmitting ? <LoadingOverlay /> : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="pdfFile"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label">Book PDF File</FormLabel>
                <FileDropzone
                  file={field.value ?? null}
                  icon="upload"
                  text="Click to upload PDF"
                  hint="PDF file (max. 50MB)"
                  accept=".pdf,application/pdf"
                  onFileChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="coverImage"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label">
                  Cover Image (Optional)
                </FormLabel>
                <FileDropzone
                  file={field.value ?? null}
                  icon="image"
                  text="Click to upload cover image"
                  hint="Leave empty to auto-generate from PDF"
                  accept="image/png,image/jpeg,image/webp"
                  onFileChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label">Title</FormLabel>
                <FormControl>
                  <input
                    {...field}
                    className="form-input"
                    placeholder="ex: Rich Dad Poor Dad"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="author"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label">Author Name</FormLabel>
                <FormControl>
                  <input
                    {...field}
                    className="form-input"
                    placeholder="ex: Robert Kiyosaki"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voice"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="form-label">
                  Choose Assistant Voice
                </FormLabel>
                <FormDescription className="sr-only">
                  Pick one voice to narrate and discuss the uploaded book.
                </FormDescription>

                <div className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[#5d4a38]">
                      Male Voices
                    </p>
                    <div className="voice-selector-options flex-col md:flex-row">
                      {voices.male.map((voice) => {
                        const isSelected = field.value === voice.value;

                        return (
                          <label
                            key={voice.value}
                            className={cn(
                              "voice-selector-option items-start justify-start text-left",
                              isSelected
                                ? "voice-selector-option-selected"
                                : "voice-selector-option-default",
                            )}
                          >
                            <input
                              type="radio"
                              name={field.name}
                              value={voice.value}
                              checked={isSelected}
                              onChange={() => field.onChange(voice.value)}
                              className="mt-1 size-4 accent-[#663820]"
                            />
                            <span className="space-y-1">
                              <span className="block text-base font-semibold text-[#2d241d]">
                                {voice.label}
                              </span>
                              <span className="block text-sm leading-5 text-[#6c5b4d]">
                                {voice.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[#5d4a38]">
                      Female Voices
                    </p>
                    <div className="voice-selector-options flex-col md:flex-row">
                      {voices.female.map((voice) => {
                        const isSelected = field.value === voice.value;

                        return (
                          <label
                            key={voice.value}
                            className={cn(
                              "voice-selector-option items-start justify-start text-left",
                              isSelected
                                ? "voice-selector-option-selected"
                                : "voice-selector-option-default",
                            )}
                          >
                            <input
                              type="radio"
                              name={field.name}
                              value={voice.value}
                              checked={isSelected}
                              onChange={() => field.onChange(voice.value)}
                              className="mt-1 size-4 accent-[#663820]"
                            />
                            <span className="space-y-1">
                              <span className="block text-base font-semibold text-[#2d241d]">
                                {voice.label}
                              </span>
                              <span className="block text-sm leading-5 text-[#6c5b4d]">
                                {voice.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="form-btn font-serif">
            Begin Synthesis
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default UploadForm;
