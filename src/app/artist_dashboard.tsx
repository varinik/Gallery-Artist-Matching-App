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
  ImageBackground,
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

// ---- Responsive grid sizing ----
// Adjust breakpoints/columns to taste. More columns on wider screens (tablets),
// fewer on narrow phones.
const GRID_SPACING = 4;
const GRID_PADDING = 16;
// ---- Types --------------------------------------------------------------

type Profile = {
  id: string;
  username: string;
  profile_pic: string;
  user_type: "artist" | "gallery";
  answers: Record<string, string>;
};

type ArtworkDescription = {
  title: string;
  medium: string;
  size: string;
  description: string;
};

type GalleryImage = {
  id: string;
  image_url: string;
  description: ArtworkDescription | null;
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

const EMPTY_ARTWORK_FORM: ArtworkDescription = {
  title: "",
  medium: "",
  size: "",
  description: "",
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

  const [contentWidth, setContentWidth] = useState(SCREEN_WIDTH);

  const numColumns = contentWidth >= 900 ? 4 : contentWidth >= 600 ? 3 : 2;
  const tileSize =
    (contentWidth - GRID_PADDING * 2 - GRID_SPACING * (numColumns - 1)) /
    numColumns;

  // Modals
  const [editAboutVisible, setEditAboutVisible] = useState(false);
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});
  const [newBlogVisible, setNewBlogVisible] = useState(false);
  const [newBlogText, setNewBlogText] = useState("");
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [postingBlog, setPostingBlog] = useState(false);

  // Gallery upload flow: pick -> fill details -> upload+save
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [artworkForm, setArtworkForm] =
    useState<ArtworkDescription>(EMPTY_ARTWORK_FORM);
  const [artworkFormVisible, setArtworkFormVisible] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Viewing a gallery item's details (tracked by index so we can navigate
  // between posts with arrows)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editArtworkForm, setEditArtworkForm] =
    useState<ArtworkDescription>(EMPTY_ARTWORK_FORM);
  const [savingCaption, setSavingCaption] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);

  const viewingImage =
    viewingIndex !== null ? galleryImages[viewingIndex] : null;

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
    scrollRef.current?.scrollTo({ x: index * contentWidth, animated: true });
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
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

  // ---- Gallery: step 1, pick image ----

  const pickGalleryImage = async () => {
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

    // Stash the picked image and open the details form.
    // Nothing is uploaded yet — that happens once the form is submitted.
    setPendingImageUri(result.assets[0].uri);
    setArtworkForm(EMPTY_ARTWORK_FORM);
    setArtworkFormVisible(true);
  };

  // ---- Gallery: step 2, submit details -> upload + insert ----

  const submitArtwork = async () => {
    if (!userId || !pendingImageUri) return;

    if (!artworkForm.title.trim()) {
      Alert.alert(
        "Add a title",
        "Please give the piece a title before saving.",
      );
      return;
    }

    setUploadingImage(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(pendingImageUri, {
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
      console.log("uploading:", publicUrlData.publicUrl);
      const { data: inserted, error: insertError } = await supabase
        .from("gallery_images")
        .insert([
          {
            user_id: userId,
            image_url: publicUrlData.publicUrl,
            description: artworkForm, // saved as jsonb: {title, medium, size, description}
          },
        ])
        .select()
        .single();
      if (insertError) throw insertError;

      setGalleryImages((prev) => [inserted as GalleryImage, ...prev]);
      setArtworkFormVisible(false);
      setPendingImageUri(null);
      setArtworkForm(EMPTY_ARTWORK_FORM);
    } catch (e: any) {
      console.log("Artwork submit error:", JSON.stringify(e, null, 2));
      Alert.alert("Upload failed", e.message ?? "Something went wrong.");
    } finally {
      setUploadingImage(false);
    }
  };

  const cancelArtworkForm = () => {
    setArtworkFormVisible(false);
    setPendingImageUri(null);
    setArtworkForm(EMPTY_ARTWORK_FORM);
  };

  // ---- Gallery: viewing / navigating between posts ----

  const openViewer = (index: number) => {
    setViewingIndex(index);
    setEditingCaption(false);
  };

  const closeViewer = () => {
    setViewingIndex(null);
    setEditingCaption(false);
  };

  const goToPrevImage = () => {
    setEditingCaption(false);
    setViewingIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  };

  const goToNextImage = () => {
    setEditingCaption(false);
    setViewingIndex((prev) =>
      prev !== null && prev < galleryImages.length - 1 ? prev + 1 : prev,
    );
  };

  // --- Gallery: edit caption/details for an existing post ----

  const startEditingCaption = () => {
    if (!viewingImage) return;
    setEditArtworkForm(viewingImage.description ?? EMPTY_ARTWORK_FORM);
    setEditingCaption(true);
  };

  const saveCaption = async () => {
    if (!viewingImage) return;
    setSavingCaption(true);
    const { data, error } = await supabase
      .from("gallery_images")
      .update({ description: editArtworkForm })
      .eq("id", viewingImage.id)
      .select()
      .single();
    setSavingCaption(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    setGalleryImages((prev) =>
      prev.map((img) =>
        img.id === viewingImage.id ? (data as GalleryImage) : img,
      ),
    );
    setEditingCaption(false);
  };

  // ---- Gallery: delete a post ----

  // Public URLs look like:
  // https://xxx.supabase.co/storage/v1/object/public/gallery/<userId>/<file>.jpg
  // This pulls out "<userId>/<file>.jpg" so we can delete the actual storage object.
  const getStoragePathFromUrl = (url: string) => {
    const marker = "/gallery/";
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  };

  const deleteCurrentImage = () => {
    if (!viewingImage) return;
    Alert.alert(
      "Delete this piece?",
      "This will permanently remove the image and its details.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!viewingImage) return;
            setDeletingImage(true);
            try {
              const path = getStoragePathFromUrl(viewingImage.image_url);
              if (path) {
                const { error: storageError } = await supabase.storage
                  .from("gallery")
                  .remove([path]);
                if (storageError) throw storageError;
              }

              const { error: dbError } = await supabase
                .from("gallery_images")
                .delete()
                .eq("id", viewingImage.id);
              if (dbError) throw dbError;

              setGalleryImages((prev) =>
                prev.filter((img) => img.id !== viewingImage.id),
              );
              closeViewer();
            } catch (e: any) {
              console.log("Delete error:", JSON.stringify(e, null, 2));
              Alert.alert(
                "Couldn't delete",
                e.message ?? "Something went wrong.",
              );
            } finally {
              setDeletingImage(false);
            }
          },
        },
      ],
    );
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
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(255,255,255,0.4)",
        }}
      />

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

      <View
        style={styles.screen}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
      >
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
          <View style={[styles.page, { width: contentWidth }]}>
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

          {/* GALLERY — responsive Instagram-style grid */}
          <View style={[styles.page, { width: contentWidth }]}>
            <FlatList
              data={galleryImages}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              key={numColumns} // forces re-layout if column count ever changes
              contentContainerStyle={{
                padding: GRID_PADDING,
                paddingBottom: 100,
              }}
              columnWrapperStyle={
                numColumns > 1 ? { gap: GRID_SPACING } : undefined
              }
              ItemSeparatorComponent={() => (
                <View style={{ height: GRID_SPACING }} />
              )}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => openViewer(index)}>
                  <Image
                    source={{ uri: item.image_url }}
                    style={{
                      width: tileSize,
                      height: tileSize,
                      borderRadius: 6,
                      backgroundColor: "#ddd",
                    }}
                  />
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No images yet — add your first one.
                </Text>
              }
            />
            <Pressable style={styles.editFab} onPress={pickGalleryImage}>
              <Ionicons name="add" size={22} color="white" />
            </Pressable>
          </View>

          {/* BLOG UPDATES */}
          <View style={[styles.page, { width: contentWidth }]}>
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
      </View>

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

      {/* ARTWORK DETAILS FORM (shown right after picking a photo) */}
      <Modal visible={artworkFormVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Artwork details</Text>

            {pendingImageUri && (
              <Image
                source={{ uri: pendingImageUri }}
                style={styles.formPreviewImage}
              />
            )}

            <ScrollView style={{ marginTop: 12 }}>
              <Text style={styles.qaQuestion}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sunset Over the Bay"
                value={artworkForm.title}
                onChangeText={(text) =>
                  setArtworkForm((prev) => ({ ...prev, title: text }))
                }
              />

              <Text style={[styles.qaQuestion, { marginTop: 14 }]}>Medium</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Oil on canvas"
                value={artworkForm.medium}
                onChangeText={(text) =>
                  setArtworkForm((prev) => ({ ...prev, medium: text }))
                }
              />

              <Text style={[styles.qaQuestion, { marginTop: 14 }]}>Size</Text>
              <TextInput
                style={styles.input}
                placeholder='e.g. 24" x 36"'
                value={artworkForm.size}
                onChangeText={(text) =>
                  setArtworkForm((prev) => ({ ...prev, size: text }))
                }
              />

              <Text style={[styles.qaQuestion, { marginTop: 14 }]}>
                Description
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { height: 100, textAlignVertical: "top" },
                ]}
                placeholder="Tell people about this piece..."
                multiline
                value={artworkForm.description}
                onChangeText={(text) =>
                  setArtworkForm((prev) => ({ ...prev, description: text }))
                }
              />
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: "#ccc" }]}
                onPress={cancelArtworkForm}
                disabled={uploadingImage}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButton}
                onPress={submitArtwork}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* VIEW / EDIT / DELETE ARTWORK MODAL, with prev/next navigation */}
      <Modal
        visible={viewingIndex !== null}
        animationType="fade"
        transparent
        onRequestClose={closeViewer}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {viewingImage && (
              <>
                <Pressable style={styles.closeButton} onPress={closeViewer}>
                  <Ionicons name="close" size={22} color="#3a332c" />
                </Pressable>

                <View style={styles.viewImageWrapper}>
                  {viewingIndex! > 0 && (
                    <Pressable
                      style={[styles.navArrow, styles.navArrowLeft]}
                      onPress={goToPrevImage}
                    >
                      <Ionicons name="chevron-back" size={24} color="white" />
                    </Pressable>
                  )}

                  <Image
                    source={{ uri: viewingImage.image_url }}
                    style={styles.viewImage}
                    resizeMode="cover"
                  />

                  {viewingIndex! < galleryImages.length - 1 && (
                    <Pressable
                      style={[styles.navArrow, styles.navArrowRight]}
                      onPress={goToNextImage}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={24}
                        color="white"
                      />
                    </Pressable>
                  )}
                </View>

                {!editingCaption ? (
                  <ScrollView style={{ marginTop: 12 }}>
                    <Text style={styles.viewTitle}>
                      {viewingImage.description?.title || "Untitled"}
                    </Text>
                    {!!viewingImage.description?.medium && (
                      <Text style={styles.viewMeta}>
                        Medium: {viewingImage.description.medium}
                      </Text>
                    )}
                    {!!viewingImage.description?.size && (
                      <Text style={styles.viewMeta}>
                        Size: {viewingImage.description.size}
                      </Text>
                    )}
                    {!!viewingImage.description?.description && (
                      <Text style={styles.viewDescription}>
                        {viewingImage.description.description}
                      </Text>
                    )}

                    <View style={styles.modalButtonRow}>
                      <Pressable
                        style={[
                          styles.modalButton,
                          { backgroundColor: "#ccc" },
                        ]}
                        onPress={startEditingCaption}
                      >
                        <Text style={styles.modalButtonText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.modalButton,
                          { backgroundColor: "#b3453e" },
                        ]}
                        onPress={deleteCurrentImage}
                        disabled={deletingImage}
                      >
                        {deletingImage ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={styles.modalButtonText}>Delete</Text>
                        )}
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : (
                  <ScrollView style={{ marginTop: 12 }}>
                    <Text style={styles.qaQuestion}>Title</Text>
                    <TextInput
                      style={styles.input}
                      value={editArtworkForm.title}
                      onChangeText={(text) =>
                        setEditArtworkForm((prev) => ({
                          ...prev,
                          title: text,
                        }))
                      }
                    />

                    <Text style={[styles.qaQuestion, { marginTop: 14 }]}>
                      Medium
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={editArtworkForm.medium}
                      onChangeText={(text) =>
                        setEditArtworkForm((prev) => ({
                          ...prev,
                          medium: text,
                        }))
                      }
                    />

                    <Text style={[styles.qaQuestion, { marginTop: 14 }]}>
                      Size
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={editArtworkForm.size}
                      onChangeText={(text) =>
                        setEditArtworkForm((prev) => ({
                          ...prev,
                          size: text,
                        }))
                      }
                    />

                    <Text style={[styles.qaQuestion, { marginTop: 14 }]}>
                      Description
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { height: 100, textAlignVertical: "top" },
                      ]}
                      multiline
                      value={editArtworkForm.description}
                      onChangeText={(text) =>
                        setEditArtworkForm((prev) => ({
                          ...prev,
                          description: text,
                        }))
                      }
                    />

                    <View style={styles.modalButtonRow}>
                      <Pressable
                        style={[
                          styles.modalButton,
                          { backgroundColor: "#ccc" },
                        ]}
                        onPress={() => setEditingCaption(false)}
                        disabled={savingCaption}
                      >
                        <Text style={styles.modalButtonText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={styles.modalButton}
                        onPress={saveCaption}
                        disabled={savingCaption}
                      >
                        {savingCaption ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={styles.modalButtonText}>Save</Text>
                        )}
                      </Pressable>
                    </View>
                  </ScrollView>
                )}
              </>
            )}
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
    </ImageBackground>
  );
}

// ---- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  screen: {
    width: "96%",
    height: "72%",
    borderRadius: 45,
    marginBottom: 10,
    backgroundColor: "#f5f0e6",
    alignSelf: "center",
    alignContent: "center",
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
    marginTop: 10,
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
    maxHeight: "85%",
    maxWidth: "90%",
    left: 20,
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
    gap: 15,
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
  formPreviewImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#ddd",
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 4,
  },
  viewImageWrapper: {
    position: "relative",
  },
  viewImage: {
    width: "100%",
    height: 260,
    borderRadius: 12,
    backgroundColor: "#ddd",
  },
  navArrow: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 33,
    height: 33,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  navArrowLeft: {
    left: -56,
    top: 190,
  },
  navArrowRight: {
    right: -56,
    top: 190,
  },
  viewTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3a332c",
    marginBottom: 6,
  },
  viewMeta: {
    fontSize: 13,
    color: "#6b6258",
    marginBottom: 2,
  },
  viewDescription: {
    fontSize: 14,
    color: "#3a332c",
    marginTop: 10,
    lineHeight: 20,
  },
});
