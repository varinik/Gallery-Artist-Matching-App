import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string;
  profile_pic: string;
  answers: Record<string, string>;
};

const QUESTION_LABELS: Record<string, string> = {
  artist_type: "Type of artist you're looking for",
  art_style: "Style of art you're interested in",
};

export default function GalleryProfileScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPic, setUploadingPic] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }
    setUserId(uid);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .single();

    if (error) console.error("Failed to load profile:", error.message);

    setProfile(data ?? null);
    setLoading(false);
  };

  const pickAndUploadPic = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow access to photos to update your picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled || !userId) return;

    setUploadingPic(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const filePath = `avatars/${userId}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("profile_pic")
        .upload(filePath, decode(base64), { contentType: "image/jpeg", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("profile_pic").getPublicUrl(filePath);
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ profile_pic: urlData.publicUrl })
        .eq("id", userId);
      if (updateErr) throw updateErr;

      setProfile((prev) => prev ? { ...prev, profile_pic: urlData.publicUrl } : prev);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Something went wrong.");
    } finally {
      setUploadingPic(false);
    }
  };

  const openEdit = () => {
    setEditAnswers(profile?.answers ?? {});
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ answers: editAnswers })
      .eq("id", userId);
    setSaving(false);

    if (error) { Alert.alert("Couldn't save", error.message); return; }

    setProfile((prev) => prev ? { ...prev, answers: editAnswers } : prev);
    setEditVisible(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4d4139" />
      </View>
    );
  }

  const displayName = profile?.username || "Gallery";
  const displayLocation = profile?.answers?.artist_type || "Art preferences not set";

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={pickAndUploadPic} disabled={uploadingPic}>
          <View style={styles.picWrapper}>
            <Image source={{ uri: profile?.profile_pic }} style={styles.profileImage} />
            {uploadingPic ? (
              <View style={styles.picOverlay}>
                <ActivityIndicator color="white" />
              </View>
            ) : (
              <View style={styles.picEditBadge}>
                <Ionicons name="camera-outline" size={14} color="white" />
              </View>
            )}
          </View>
        </Pressable>

        <View style={{ marginLeft: 16, flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{displayLocation}</Text>
        </View>
      </View>

      {/* CONTENT CARD */}
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.pageContent}>
          <Text style={styles.sectionTitle}>About</Text>
          {Object.entries(QUESTION_LABELS).map(([key, label]) => (
            <View key={key} style={styles.qaBlock}>
              <Text style={styles.qaQuestion}>{label}</Text>
              <Text style={styles.qaAnswer}>{profile?.answers?.[key] || "—"}</Text>
            </View>
          ))}
        </ScrollView>

        {/* EDIT FAB */}
        <Pressable style={styles.editFab} onPress={openEdit}>
          <Ionicons name="pencil" size={20} color="white" />
        </Pressable>
      </View>

      {/* BOTTOM NAV */}
      <View style={styles.bottomNav}>
        <Pressable onPress={() => router.replace("/gallery_dashboard")} style={styles.navIcon}>
          <Ionicons name="albums-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/messages")} style={styles.navIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/notifications")} style={styles.navIcon}>
          <Ionicons name="notifications-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/calendar")} style={styles.navIcon}>
          <Ionicons name="calendar-outline" size={26} color="#4d4139" />
        </Pressable>
        {/* Active: profile */}
        <Pressable style={styles.navIcon}>
          <Ionicons name="person" size={26} color="#3a332c" />
        </Pressable>
      </View>

      {/* EDIT MODAL */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <ScrollView>
              {Object.entries(QUESTION_LABELS).map(([key, label]) => (
                <View key={key} style={{ marginBottom: 14 }}>
                  <Text style={styles.qaQuestion}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    value={editAnswers[key] || ""}
                    onChangeText={(text) =>
                      setEditAnswers((prev) => ({ ...prev, [key]: text }))
                    }
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: "#ccc" }]}
                onPress={() => setEditVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButton}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },

  picWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ddd",
    overflow: "visible",
  },

  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ddd",
  },

  picOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 45,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  picEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#3a332c",
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    fontSize: 20,
    fontWeight: "700",
    color: "#3a332c",
  },

  subtitle: {
    fontSize: 14,
    color: "#6b6258",
    marginTop: 4,
  },

  screen: {
    width: "96%",
    flex: 1,
    borderRadius: 45,
    marginBottom: 10,
    backgroundColor: "#f5f0e6",
    alignSelf: "center",
  },

  pageContent: {
    padding: 24,
    paddingBottom: 100,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3a332c",
    marginBottom: 16,
  },

  qaBlock: {
    marginBottom: 20,
  },

  qaQuestion: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3a332c",
    marginBottom: 4,
  },

  qaAnswer: {
    fontSize: 15,
    color: "#6b6258",
  },

  editFab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#3a332c",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },

  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14,
    backgroundColor: "#7c6f63",
  },

  navIcon: {
    padding: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },

  modalCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#3a332c",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },

  modalButtonRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },

  modalButton: {
    flex: 1,
    backgroundColor: "#3a332c",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },

  modalButtonText: {
    color: "white",
    fontWeight: "600",
  },
});
