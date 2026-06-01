/**
 * Resolve Expo modules loaded via dynamic import() in Metro/RN.
 * Namespace may be on the module root or under .default.
 */

type WithDefault<T> = T & { default?: T };

export function resolveExpoModule<T extends object>(
  loaded: WithDefault<T>,
  label: string
): T {
  const mod =
    loaded != null &&
    typeof loaded === 'object' &&
    'default' in loaded &&
    (loaded as { default?: T }).default != null
      ? (loaded as { default: T }).default
      : loaded;

  if (mod == null || typeof mod !== 'object') {
    throw new Error(`${label}: module did not load`);
  }

  return mod;
}

/** Minimal File instance surface from expo-file-system (SDK 56+). */
export type ExpoRelocationOptions = {
  idempotent?: boolean;
};

export type ExpoFileInstance = {
  uri: string;
  exists: boolean;
  create: () => void;
  write: (content: string) => void | Promise<void>;
  text: () => string | Promise<string>;
  copy: (
    destination: ExpoDirectoryInstance | ExpoFileInstance,
    options?: ExpoRelocationOptions
  ) => void | Promise<void>;
};

export type ExpoFileConstructor = new (
  ...uris: Array<string | ExpoFileInstance | ExpoDirectoryInstance>
) => ExpoFileInstance;

export type ExpoDirectoryInstance = {
  uri: string;
};

export type ExpoPathsStatic = {
  document: ExpoDirectoryInstance;
  cache: ExpoDirectoryInstance;
};

export type ExpoPrint = {
  printToFileAsync: (options: { html: string }) => Promise<{ uri: string }>;
};

export type ExpoFileSystemModule = {
  File: ExpoFileConstructor;
  Paths: ExpoPathsStatic;
};

export type ExpoSharing = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (
    url: string,
    options?: { mimeType?: string; dialogTitle?: string; UTI?: string }
  ) => Promise<void>;
};

export type ExpoDocumentPicker = {
  getDocumentAsync: (options: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }) => Promise<DocumentPickerResultShape>;
};

/** Supports current and older expo-document-picker result shapes. */
export type DocumentPickerResultShape = {
  canceled?: boolean;
  cancelled?: boolean;
  assets?: Array<{ uri?: string; name?: string }>;
  uri?: string;
  name?: string;
};

export async function loadExpoFileSystem(): Promise<ExpoFileSystemModule> {
  const loaded = await import('expo-file-system');
  const mod = resolveExpoModule(loaded as WithDefault<Record<string, unknown>>, 'expo-file-system');
  console.error('[expo-file-system] module keys', Object.keys(mod ?? {}));

  const File = mod.File as ExpoFileConstructor | undefined;
  const Paths = mod.Paths as ExpoPathsStatic | undefined;

  if (!File) {
    throw new Error('expo-file-system: File class missing');
  }
  if (!Paths?.document) {
    throw new Error('expo-file-system: Paths.document missing');
  }
  if (!Paths?.cache) {
    throw new Error('expo-file-system: Paths.cache missing');
  }

  return { File, Paths };
}

export async function loadExpoPrint(): Promise<ExpoPrint> {
  const loaded = await import('expo-print');
  const Print = resolveExpoModule(loaded as WithDefault<ExpoPrint>, 'expo-print');

  if (typeof Print.printToFileAsync !== 'function') {
    throw new Error('expo-print: printToFileAsync missing');
  }

  return Print;
}

export async function loadExpoSharing(): Promise<ExpoSharing> {
  const loaded = await import('expo-sharing');
  const Sharing = resolveExpoModule(loaded as WithDefault<ExpoSharing>, 'expo-sharing');

  if (typeof Sharing.isAvailableAsync !== 'function') {
    throw new Error('expo-sharing: isAvailableAsync missing');
  }
  if (typeof Sharing.shareAsync !== 'function') {
    throw new Error('expo-sharing: shareAsync missing');
  }

  return Sharing;
}

export async function loadExpoDocumentPicker(): Promise<ExpoDocumentPicker> {
  const loaded = await import('expo-document-picker');
  const DocumentPicker = resolveExpoModule(
    loaded as WithDefault<ExpoDocumentPicker>,
    'expo-document-picker'
  );
  console.error('[expo-document-picker] module keys', Object.keys(DocumentPicker ?? {}));

  if (typeof DocumentPicker.getDocumentAsync !== 'function') {
    throw new Error('expo-document-picker: getDocumentAsync missing');
  }

  return DocumentPicker;
}

/** Parse picker result; null when user cancelled or no URI. */
export function parseDocumentPickerResult(
  result: DocumentPickerResultShape
): { uri: string; name?: string } | null {
  if (result.canceled === true || result.cancelled === true) {
    return null;
  }

  const asset = result.assets?.[0];
  const uri = asset?.uri ?? result.uri;
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  const name = asset?.name ?? result.name;
  return { name: typeof name === 'string' ? name : undefined, uri };
}

async function runMaybeAsync<T>(value: T | Promise<T>): Promise<T> {
  if (value != null && typeof (value as Promise<T>).then === 'function') {
    return value as Promise<T>;
  }
  return value as T;
}

/** Write UTF-8 text under a directory. Returns file URI for sharing. */
export async function writeUtf8FileToDirectory(
  fs: ExpoFileSystemModule,
  directory: ExpoDirectoryInstance,
  filename: string,
  contents: string
): Promise<string> {
  const { File } = fs;
  const file = new File(directory, filename);

  if (!file.exists) {
    file.create();
  }

  await runMaybeAsync(file.write(contents));

  if (!file.uri) {
    throw new Error('expo-file-system: could not resolve written file URI');
  }

  return file.uri;
}

/** Write UTF-8 text to the app document directory. Returns file URI for sharing. */
export async function writeUtf8FileToDocuments(
  fs: ExpoFileSystemModule,
  filename: string,
  contents: string
): Promise<string> {
  return writeUtf8FileToDirectory(fs, fs.Paths.document, filename, contents);
}

/** Read UTF-8 text from a file URI (e.g. document-picker result). */
export async function readUtf8FileFromUri(
  fs: ExpoFileSystemModule,
  uri: string
): Promise<string> {
  const { File } = fs;
  const file = new File(uri);
  return runMaybeAsync(file.text());
}

/** Prefer cache (temp exports); fall back to document directory. */
export function getWritableStorageDirectory(fs: ExpoFileSystemModule): ExpoDirectoryInstance {
  return fs.Paths.cache ?? fs.Paths.document;
}

/** Copy a file URI into a directory with a new filename; returns destination URI. */
export async function copyFileToDirectory(
  fs: ExpoFileSystemModule,
  sourceUri: string,
  directory: ExpoDirectoryInstance,
  filename: string
): Promise<string> {
  const { File } = fs;
  const source = new File(sourceUri);
  const dest = new File(directory, filename);

  await runMaybeAsync(source.copy(dest, { idempotent: true }));

  if (!dest.uri) {
    throw new Error('expo-file-system: could not resolve copied file URI');
  }

  return dest.uri;
}
