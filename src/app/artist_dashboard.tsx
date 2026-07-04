import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TABS = ["About", "Gallery", "Blog updates"] as const;

// ---- Types --------------------------------------------------------------

type Profile = {
  id: string;
  username: string;
  profile_pic: string;
  user_type: "artist" | "gallery";
  answers: Record<string, string>;
};

type GalleryImage = {
  id: string;
  image_url: string;
  created_at: string;
};

type BlogPost = {
  id: string;
  content: string;
  created_at: string;
};

const QUESTION_LABELS: Record<string, string> = {
  art_type: "What type of art do you create?",
  years_experience: "How many years have you been creating art?",
};

// ---- Main screen ----------------------------------------------------------

export default function ArtistDashboardScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeIndex, setActiveIndex] = useState(0);

  // Modals
  const [editAboutVisible, setEditAboutVisible] = useState(false);
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});
  const [newBlogVisible, setNewBlogVisible] = useState(false);
  const [newBlogText, setNewBlogText] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [postingBlog, setPostingBlog] = useState(false);

  useEffect(() => {
    loadEverything();
  }, []);

  const loadEverything = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    setUserId(uid);

    const [
      { data: profileData, error: profileErr },
      { data: imagesData },
      { data: postsData },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase
        .from("gallery_images")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("blog_posts")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
    ]);

    if (profileErr) {
      console.error("Failed to load profile:", profileErr.message);
    }

    setProfile(profileData ?? null);
    setGalleryImages(imagesData ?? []);
    setBlogPosts(postsData ?? []);
    setLoading(false);
  };

  // ---- Tab slider handling ----

  const goToTab = (index: number) => {
    setActiveIndex(index);
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  // ---- About: edit answers ----

  const openEditAbout = () => {
    setEditAnswers(profile?.answers ?? {});
    setEditAboutVisible(true);
  };

  const saveAnswers = async () => {
    if (!userId) return;
    setSavingAnswers(true);
    const { error } = await supabase
      .from("profiles")
      .update({ answers: editAnswers })
      .eq("id", userId);
    setSavingAnswers(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, answers: editAnswers } : prev));
    setEditAboutVisible(false);
  };

  // ---- Gallery: upload image ----

  const pickAndUploadGalleryImage = async () => {
    if (!userId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Permission needed to access photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled) return;

    setUploadingImage(true);
    try {
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileName = `${userId}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(fileName, decode(base64), {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("gallery")
        .getPublicUrl(fileName);

      const { data: inserted, error: insertError } = await supabase
        .from("gallery_images")
        .insert([{ user_id: userId, image_url: publicUrlData.publicUrl }])
        .select()
        .single();
      if (insertError) throw insertError;

      setGalleryImages((prev) => [inserted as GalleryImage, ...prev]);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Something went wrong.");
    } finally {
      setUploadingImage(false);
    }
  };

  // ---- Blog: new post ----

  const postBlogUpdate = async () => {
    if (!userId || !newBlogText.trim()) return;
    setPostingBlog(true);
    const { data, error } = await supabase
      .from("blog_posts")
      .insert([{ user_id: userId, content: newBlogText.trim() }])
      .select()
      .single();
    setPostingBlog(false);

    if (error) {
      Alert.alert("Couldn't post", error.message);
      return;
    }
    setBlogPosts((prev) => [data as BlogPost, ...prev]);
    setNewBlogText("");
    setNewBlogVisible(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4d4139" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={{ uri: profile?.profile_pic }}
          style={styles.profileImage}
        />
        <View style={{ marginLeft: 16 }}>
          <Text style={styles.name}>{profile?.username ?? "Name"}</Text>
          <Text style={styles.subtitle}>
            {profile?.answers?.art_type ?? "type of art"}
          </Text>
        </View>
      </View>

      {/* TAB SLIDER */}
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => (
          <Pressable
            key={tab}
            style={[
              styles.tabButton,
              activeIndex === i && styles.tabButtonActive,
            ]}
            onPress={() => goToTab(i)}
          >
            <Text
              style={[
                styles.tabText,
                activeIndex === i && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* SWIPEABLE CONTENT */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {/* ABOUT */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <ScrollView contentContainerStyle={styles.pageContent}>
            {Object.entries(QUESTION_LABELS).map(([key, label]) => (
              <View key={key} style={styles.qaBlock}>
                <Text style={styles.qaQuestion}>{label}</Text>
                <Text style={styles.qaAnswer}>
                  {profile?.answers?.[key] || "—"}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.editFab} onPress={openEditAbout}>
            <Ionicons name="pencil" size={20} color="white" />
          </Pressable>
        </View>

        {/* GALLERY */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <FlatList
            data={galleryImages}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.pageContent}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item.image_url }}
                style={styles.galleryImage}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No images yet — add your first one.
              </Text>
            }
          />
          <Pressable
            style={styles.editFab}
            onPress={pickAndUploadGalleryImage}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Ionicons name="add" size={22} color="white" />
            )}
          </Pressable>
        </View>

        {/* BLOG UPDATES */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <FlatList
            data={blogPosts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.pageContent}
            renderItem={({ item }) => (
              <View style={styles.blogCard}>
                <Text style={styles.blogText}>{item.content}</Text>
                <Text style={styles.blogDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No updates yet — share something.
              </Text>
            }
          />
          <Pressable
            style={styles.editFab}
            onPress={() => setNewBlogVisible(true)}
          >
            <Ionicons name="add" size={22} color="white" />
          </Pressable>
        </View>
      </ScrollView>

      {/* BOTTOM NAV */}
      <View style={styles.bottomNav}>
        <Pressable
          onPress={() => router.push("/messages")}
          style={styles.navIcon}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={26}
            color="#4d4139"
          />
        </Pressable>
        <Pressable
          onPress={() => router.push("/notifications")}
          style={styles.navIcon}
        >
          <Ionicons name="notifications-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable
          onPress={() => router.push("/calendar")}
          style={styles.navIcon}
        >
          <Ionicons name="calendar-outline" size={26} color="#4d4139" />
        </Pressable>
      </View>

      {/* EDIT ABOUT MODAL */}
      <Modal visible={editAboutVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit About</Text>
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
                onPress={() => setEditAboutVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButton}
                onPress={saveAnswers}
                disabled={savingAnswers}
              >
                {savingAnswers ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* NEW BLOG POST MODAL */}
      <Modal visible={newBlogVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New update</Text>
            <TextInput
              style={[styles.input, { height: 120, textAlignVertical: "top" }]}
              multiline
              placeholder="What's new?"
              value={newBlogText}
              onChangeText={setNewBlogText}
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: "#ccc" }]}
                onPress={() => setNewBlogVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButton}
                onPress={postBlogUpdate}
                disabled={postingBlog}
              >
                {postingBlog ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalButtonText}>Post</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f0e6",
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
  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ddd",
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
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 24,
    backgroundColor: "#7c6f63",
    borderRadius: 24,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#f5f0e6",
  },
  tabText: {
    color: "#f5f0e6",
    fontWeight: "600",
    fontSize: 13,
  },
  tabTextActive: {
    color: "#3a332c",
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: 24,
    paddingBottom: 100,
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
  galleryImage: {
    width: (SCREEN_WIDTH - 24 * 2 - 12) / 2,
    height: (SCREEN_WIDTH - 24 * 2 - 12) / 2,
    borderRadius: 12,
    margin: 6,
    backgroundColor: "#ddd",
  },
  blogCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  blogText: {
    fontSize: 15,
    color: "#3a332c",
  },
  blogDate: {
    fontSize: 12,
    color: "#a09989",
    marginTop: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#a09989",
    marginTop: 40,
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
