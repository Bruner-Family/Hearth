import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { Button, ErrorNote, SectionTitle } from "@/components/ui";
import {
  assertWithinSizeLimit,
  attachmentDisplayName,
  DOCUMENT_MIME_TYPE,
} from "@/lib/attachments";
import type { Attachment } from "@/lib/database.types";
import {
  useAttachments,
  useAttachmentUrl,
  useDeleteAttachment,
  useLogAttachments,
  useUploadAttachment,
} from "@/lib/queries";

type AttachmentsSectionProps = {
  householdId: string;
  itemId: string;
  /**
   * When set, files are filed under this maintenance log entry (receipt,
   * service report) instead of the item itself.
   */
  maintenanceLogId?: string;
};

/**
 * Receipt photos, manuals & documents (ADR-001 §2.4). Phone camera → receipt
 * photo is the killer convenience for the data-entry story, so camera is
 * offered first on mobile; PDFs come in through the document picker.
 */
export function AttachmentsSection({
  householdId,
  itemId,
  maintenanceLogId,
}: AttachmentsSectionProps) {
  const itemAttachments = useAttachments(maintenanceLogId ? undefined : itemId);
  const logAttachments = useLogAttachments(maintenanceLogId);
  const attachments =
    (maintenanceLogId ? logAttachments.data : itemAttachments.data) ?? [];
  const upload = useUploadAttachment();
  const [error, setError] = useState<string>();

  const add = async (asset: {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
  }) => {
    assertWithinSizeLimit(asset.name, asset.size);
    const body = await (await fetch(asset.uri)).arrayBuffer();
    await upload.mutateAsync({
      householdId,
      itemId,
      maintenanceLogId,
      fileName: asset.name,
      mimeType: asset.mimeType,
      body,
    });
  };

  const addPhoto = async (source: "camera" | "library") => {
    setError(undefined);
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: "images",
        quality: 0.8,
      };
      const result =
        source === "camera"
          ? await (async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) throw new Error("Camera permission denied");
              return ImagePicker.launchCameraAsync(options);
            })()
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      await add({
        uri: asset.uri,
        name: asset.fileName ?? `photo.${mimeType.split("/")[1] ?? "jpg"}`,
        mimeType,
        size: asset.fileSize,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const addDocument = async () => {
    setError(undefined);
    try {
      // PDF only: the storage bucket's allowed_mime_types rejects anything
      // else, so filtering here beats failing after the picker.
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_MIME_TYPE,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      await add({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? DOCUMENT_MIME_TYPE,
        size: asset.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <View>
      <SectionTitle>Attachments</SectionTitle>
      {attachments.length > 0 ? (
        <View className="mb-3 flex-row flex-wrap gap-3">
          {attachments.map((att) => (
            <AttachmentThumb key={att.id} attachment={att} />
          ))}
        </View>
      ) : (
        <Text className="mb-3 text-sm text-ink-dim">
          {maintenanceLogId
            ? "No receipt or service report on this entry yet."
            : "No receipts, manuals, or photos yet."}
        </Text>
      )}
      {error ? <ErrorNote message={error} /> : null}
      <View className="flex-row gap-3">
        {Platform.OS !== "web" ? (
          <View className="flex-1">
            <Button
              title="Take photo"
              variant="secondary"
              loading={upload.isPending}
              onPress={() => addPhoto("camera")}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Button
            title="Add photo"
            variant="secondary"
            loading={upload.isPending}
            onPress={() => addPhoto("library")}
          />
        </View>
      </View>
      <View className="mt-3">
        <Button
          title="Add document (PDF)"
          variant="secondary"
          loading={upload.isPending}
          onPress={addDocument}
        />
      </View>
    </View>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const { data: url } = useAttachmentUrl(attachment.storage_path);
  const del = useDeleteAttachment();
  const isImage = attachment.mime_type.startsWith("image/");
  const name = attachmentDisplayName(attachment);

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      // RN Alert buttons are a no-op on web
      if (window.confirm("Delete this attachment?")) del.mutate(attachment);
      return;
    }
    Alert.alert("Delete attachment?", name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => del.mutate(attachment),
      },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={name}
      accessibilityHint="Opens the attachment; long-press to delete"
      onPress={() => url && Linking.openURL(url)}
      onLongPress={confirmDelete}
      className="active:opacity-70"
    >
      <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-edge bg-card">
        {url && isImage ? (
          <Image source={{ uri: url }} className="h-24 w-24" />
        ) : (
          // Documents look alike, so the name is what tells them apart.
          <View className="items-center px-1.5">
            <Text className="text-2xl">📄</Text>
            <Text
              numberOfLines={2}
              className="mt-1 text-center text-[10px] leading-tight text-ink-dim"
            >
              {name}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
