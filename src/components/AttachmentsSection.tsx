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
import type { Attachment } from "@/lib/database.types";
import {
  useAttachments,
  useAttachmentUrl,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/lib/queries";

/**
 * Receipt photos & manuals (ADR-001 §2.4). Phone camera → receipt photo is
 * the killer convenience for the data-entry story, so camera is offered
 * first on mobile.
 */
export function AttachmentsSection({
  householdId,
  itemId,
}: {
  householdId: string;
  itemId: string;
}) {
  const { data: attachments = [] } = useAttachments(itemId);
  const upload = useUploadAttachment();
  const [error, setError] = useState<string>();

  const addFrom = async (source: "camera" | "library") => {
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
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const mimeType = asset.mimeType ?? "image/jpeg";
      await upload.mutateAsync({
        householdId,
        itemId,
        fileName: asset.fileName ?? `photo.${mimeType.split("/")[1] ?? "jpg"}`,
        mimeType,
        body,
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
          No receipts, manuals, or photos yet.
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
              onPress={() => addFrom("camera")}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Button
            title="Add photo"
            variant="secondary"
            loading={upload.isPending}
            onPress={() => addFrom("library")}
          />
        </View>
      </View>
    </View>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const { data: url } = useAttachmentUrl(attachment.storage_path);
  const del = useDeleteAttachment();

  const confirmDelete = () => {
    if (Platform.OS === "web") {
      // RN Alert buttons are a no-op on web
      if (window.confirm("Delete this attachment?")) del.mutate(attachment);
      return;
    }
    Alert.alert("Delete attachment?", undefined, [
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
      accessibilityHint="Opens the attachment; long-press to delete"
      onPress={() => url && Linking.openURL(url)}
      onLongPress={confirmDelete}
      className="active:opacity-70"
    >
      <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-edge bg-card">
        {url && attachment.mime_type.startsWith("image/") ? (
          <Image source={{ uri: url }} className="h-24 w-24" />
        ) : (
          <Text className="text-3xl">📄</Text>
        )}
      </View>
    </Pressable>
  );
}
