import {
  ImageBackground,
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Image,
  Pressable,
  Modal,
  ScrollView,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { getRankedArtists } from "@/lib/matchApi";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const PROFILE_TABS = ["About", "Gallery", "Blog updates"] as const;
const GRID_SPACING = 4;
const GRID_PADDING = 16;

type ArtistProfile = {
  id: string;
  username: string;
  profile_pic: string;
  answers: Record<string, string>;
  compatibility?: number;
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
};

type BlogPost = {
  id: string;
  content: string;
  created_at: string;
};

const QUESTION_LABELS: Record<string, string> = {
  location: "Where are you located?",
  medium: "What medium(s) do you use?",
  years_experience: "How experienced are you in creating art?",
  art_type: "What style of art do you gravitate towards creating?",
  reason:
    "Why do you create art and what message do you want to send viewers with your pieces?",
  goals: "What are you short and long term goals for your art?",
};

export default function GalleryDashboardScreen() {
  const router = useRouter();

  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const [profileModal, setProfileModal] = useState(false);
  const [modalArtist, setModalArtist] = useState<ArtistProfile | null>(null);
  const [modalImages, setModalImages] = useState<GalleryImage[]>([]);
  const [modalBlogPosts, setModalBlogPosts] = useState<BlogPost[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [viewingArtIndex, setViewingArtIndex] = useState<number | null>(null);

  const [activeProfileTab, setActiveProfileTab] = useState(0);
  const [profileContentWidth, setProfileContentWidth] = useState(SCREEN_WIDTH);
  const profileScrollRef = useRef<ScrollView>(null);

  const profileNumColumns =
    profileContentWidth >= 900 ? 4 : profileContentWidth >= 600 ? 3 : 2;
  const profileTileSize =
    (profileContentWidth - GRID_PADDING * 2 - GRID_SPACING * (profileNumColumns - 1)) /
    profileNumColumns;

  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    loadArtists();
  }, []);

  const loadArtists = async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      return;
    }

    const userId = session.user.id;
    setGalleryId(userId);

    // Get every artist this gallery has already swiped on
    const { data: swiped, error: swipedError } = await supabase
      .from("swipes")
      .select("artist_id")
      .eq("gallery_id", userId);

    if (swipedError) {
      console.error("Error fetching swipe history:", swipedError);
      setLoading(false);
      return;
    }

    const swipedIds = new Set((swiped ?? []).map((s) => s.artist_id));

    // Try the matching backend for ranked + scored results
    try {
      const ranked = await getRankedArtists(userId);
      const filtered = ranked
        .filter((r) => !swipedIds.has(r.artist_id))
        .map((r) => ({
          id: r.artist_id,
          username: r.username,
          profile_pic: r.profile_pic,
          answers: r.answers,
          compatibility: r.compatibility,
        }));
      setArtists(filtered);
      setCurrentIndex(0);
      setLoading(false);
      return;
    } catch (err) {
      console.log(
        "Matching backend unavailable, falling back to Supabase:",
        err,
      );
    }

    // Fallback: direct Supabase query without compatibility scores
    let query = supabase
      .from("profiles")
      .select("id, username, profile_pic, answers")
      .eq("user_type", "artist")
      .neq("id", userId);

    if (swipedIds.size > 0) {
      query = query.not("id", "in", `(${[...swipedIds].join(",")})`);
    }

    const { data: artistData, error: artistError } = await query;

    if (artistError) {
      console.error("Error fetching artists:", artistError);
      setLoading(false);
      return;
    }

    setArtists(artistData ?? []);
    setCurrentIndex(0);
    setLoading(false);
  };

  const recordSwipe = async (
    artist: ArtistProfile,
    decision: "liked" | "passed",
  ) => {
    if (!galleryId) return;

    console.log(galleryId, artist.id);

    const { error } = await supabase.from("swipes").insert([
      {
        gallery_id: galleryId,
        artist_id: artist.id,
        decision,
      },
    ]);

    if (error) {
      console.error("Error recording swipe:", error);
      return;
    }

    if (decision === "liked") {
      // 🔑 placeholder for real messaging logic later
      console.log(`Message sent to artist: ${artist.username} (${artist.id})`);
    } else {
      console.log(`Passed on artist: ${artist.username} (${artist.id})`);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe("liked");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe("passed");
        } else {
          resetPosition();
        }
      },
    }),
  ).current;

  const forceSwipe = (decision: "liked" | "passed") => {
    const x = decision === "liked" ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;

    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(decision));
  };

  const onSwipeComplete = (decision: "liked" | "passed") => {
    const artist = artists[currentIndex];
    if (artist) {
      recordSwipe(artist, decision);
    }

    position.setValue({ x: 0, y: 0 });
    setCurrentIndex((prev) => prev + 1);
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const openArtistProfile = async (artist: ArtistProfile) => {
    setModalArtist(artist);
    setProfileModal(true);
    setActiveProfileTab(0);
    setViewingArtIndex(null);
    setLoadingImages(true);
    const [{ data: imagesData }, { data: postsData }] = await Promise.all([
      supabase
        .from("gallery_images")
        .select("id, image_url, description")
        .eq("user_id", artist.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("blog_posts")
        .select("id, content, created_at")
        .eq("user_id", artist.id)
        .order("created_at", { ascending: false }),
    ]);
    setModalImages(imagesData ?? []);
    setModalBlogPosts(postsData ?? []);
    setLoadingImages(false);
  };

  const goToProfileTab = (index: number) => {
    setActiveProfileTab(index);
    profileScrollRef.current?.scrollTo({
      x: index * profileContentWidth,
      animated: true,
    });
  };

  const onProfileScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(
      e.nativeEvent.contentOffset.x / profileContentWidth,
    );
    setActiveProfileTab(index);
  };

  const viewingArt =
    viewingArtIndex !== null ? modalImages[viewingArtIndex] : null;

  const openArtworkViewer = (index: number) => {
    setViewingArtIndex(index);
  };

  const closeArtworkViewer = () => {
    setViewingArtIndex(null);
  };

  const goToPrevArt = () => {
    setViewingArtIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  };

  const goToNextArt = () => {
    setViewingArtIndex((prev) =>
      prev !== null && prev < modalImages.length - 1 ? prev + 1 : prev,
    );
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      outputRange: ["-10deg", "0deg", "10deg"],
    });

    return {
      ...position.getLayout(),
      transform: [{ rotate }],
    };
  };

  const renderCards = () => {
    if (loading) {
      return <Text style={styles.infoText}>Loading artists...</Text>;
    }

    if (currentIndex >= artists.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.infoText}>
            No more artists to review right now.
          </Text>
          <Pressable style={styles.refreshButton} onPress={loadArtists}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
      );
    }

    return artists
      .map((artist, index) => {
        if (index < currentIndex) return null;

        if (index === currentIndex) {
          return (
            <Animated.View
              key={artist.id}
              style={[styles.card, getCardStyle()]}
              {...panResponder.panHandlers}
            >
              <ArtistCard artist={artist} />
            </Animated.View>
          );
        }

        // render the next card underneath, slightly smaller, for stack effect
        return (
          <View key={artist.id} style={[styles.card, styles.cardBehind]}>
            <ArtistCard artist={artist} />
          </View>
        );
      })
      .reverse();
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <Text style={styles.title}>Discover Artists</Text>

        <View style={styles.cardStack}>{renderCards()}</View>

        {currentIndex < artists.length && !loading && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.passButton]}
              onPress={() => forceSwipe("passed")}
            >
              <Text style={styles.actionButtonText}>✕</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.infoButton]}
              onPress={() => openArtistProfile(artists[currentIndex])}
            >
              <Ionicons
                name="information-circle-outline"
                size={28}
                color="#4d4139"
              />
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.likeButton]}
              onPress={() => forceSwipe("liked")}
            >
              <Text style={styles.actionButtonText}>♥</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* BOTTOM NAV */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navIcon}>
          <Ionicons name="albums" size={26} color="#3a332c" />
        </Pressable>
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
        <Pressable
          onPress={() => router.push("/gallery_profile")}
          style={styles.navIcon}
        >
          <Ionicons name="person-outline" size={26} color="#4d4139" />
        </Pressable>
      </View>

      {/* ARTIST PROFILE MODAL */}
      <Modal
        visible={profileModal}
        animationType="slide"
        onRequestClose={() => setProfileModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalBackBtn}
              onPress={() => {
                setProfileModal(false);
                setViewingArtIndex(null);
              }}
            >
              <Ionicons name="chevron-back" size={26} color="#3a332c" />
              <Text style={styles.modalBackText}>Back</Text>
            </Pressable>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {modalArtist?.username ?? "Artist"}
            </Text>
            <View style={{ width: 70 }} />
          </View>

          {modalArtist && (
            <>
              {/* PROFILE HEADER — same layout as the artist's own dashboard */}
              <View style={styles.profileHeader}>
                <Image
                  source={{ uri: modalArtist.profile_pic }}
                  style={styles.profileHeaderImage}
                />
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <Text style={styles.profileHeaderName} numberOfLines={1}>
                    {modalArtist.username}
                  </Text>
                  <Text style={styles.profileHeaderSubtitle} numberOfLines={1}>
                    {modalArtist.answers?.art_type || "type of art"}
                  </Text>
                  {modalArtist.compatibility !== undefined && (
                    <View style={styles.profileMatchBadge}>
                      <Text style={styles.modalBadgeText}>
                        {Math.round(modalArtist.compatibility)}% match
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View
                style={styles.profileScreen}
                onLayout={(e) =>
                  setProfileContentWidth(e.nativeEvent.layout.width)
                }
              >
                {/* TAB BAR */}
                <View style={styles.tabBar}>
                  {PROFILE_TABS.map((tab, i) => (
                    <Pressable
                      key={tab}
                      style={[
                        styles.tabButton,
                        activeProfileTab === i && styles.tabButtonActive,
                      ]}
                      onPress={() => goToProfileTab(i)}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          activeProfileTab === i && styles.tabTextActive,
                        ]}
                      >
                        {tab}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* SWIPEABLE CONTENT — About / Gallery / Blog updates */}
                <ScrollView
                  key={modalArtist.id}
                  ref={profileScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onProfileScrollEnd}
                  style={{ flex: 1 }}
                >
                  {/* ABOUT */}
                  <View style={[styles.page, { width: profileContentWidth }]}>
                    <ScrollView contentContainerStyle={styles.pageContent}>
                      {Object.entries(QUESTION_LABELS).map(([key, label]) => (
                        <View key={key} style={styles.qaBlock}>
                          <Text style={styles.qaQuestion}>{label}</Text>
                          <Text style={styles.qaAnswer}>
                            {modalArtist.answers?.[key] || "—"}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>

                  {/* GALLERY — responsive Instagram-style grid, read-only */}
                  <View style={[styles.page, { width: profileContentWidth }]}>
                    {loadingImages ? (
                      <ActivityIndicator
                        color="#4d4139"
                        style={{ marginTop: 40 }}
                      />
                    ) : (
                      <FlatList
                        data={modalImages}
                        keyExtractor={(item) => item.id}
                        numColumns={profileNumColumns}
                        key={profileNumColumns}
                        contentContainerStyle={{
                          padding: GRID_PADDING,
                          paddingBottom: 100,
                        }}
                        columnWrapperStyle={
                          profileNumColumns > 1
                            ? { gap: GRID_SPACING }
                            : undefined
                        }
                        ItemSeparatorComponent={() => (
                          <View style={{ height: GRID_SPACING }} />
                        )}
                        renderItem={({ item, index }) => (
                          <Pressable onPress={() => openArtworkViewer(index)}>
                            <Image
                              source={{ uri: item.image_url }}
                              style={{
                                width: profileTileSize,
                                height: profileTileSize,
                                borderRadius: 6,
                                backgroundColor: "#ddd",
                              }}
                            />
                          </Pressable>
                        )}
                        ListEmptyComponent={
                          <Text style={styles.emptyText}>
                            No artwork uploaded yet.
                          </Text>
                        }
                      />
                    )}
                  </View>

                  {/* BLOG UPDATES */}
                  <View style={[styles.page, { width: profileContentWidth }]}>
                    <FlatList
                      data={modalBlogPosts}
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
                        <Text style={styles.emptyText}>No updates yet.</Text>
                      }
                    />
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          {/* ARTWORK POST VIEW — slides over the profile, Facebook-post style */}
          {viewingArt && (
            <View style={styles.artOverlay}>
              <View style={styles.modalHeader}>
                <Pressable
                  style={styles.modalBackBtn}
                  onPress={closeArtworkViewer}
                >
                  <Ionicons name="chevron-back" size={26} color="#3a332c" />
                  <Text style={styles.modalBackText}>Back</Text>
                </Pressable>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  {viewingArt.description?.title || "Untitled"}
                </Text>
                <View style={{ width: 70 }} />
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.artPostImageWrapper}>
                  {viewingArtIndex! > 0 && (
                    <Pressable
                      style={[styles.artNavArrow, styles.artNavArrowLeft]}
                      onPress={goToPrevArt}
                    >
                      <Ionicons name="chevron-back" size={24} color="white" />
                    </Pressable>
                  )}

                  <Image
                    source={{ uri: viewingArt.image_url }}
                    style={styles.artPostImage}
                    resizeMode="cover"
                  />

                  {viewingArtIndex! < modalImages.length - 1 && (
                    <Pressable
                      style={[styles.artNavArrow, styles.artNavArrowRight]}
                      onPress={goToNextArt}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={24}
                        color="white"
                      />
                    </Pressable>
                  )}
                </View>

                <View style={styles.artPostBody}>
                  <Text style={styles.artViewTitle}>
                    {viewingArt.description?.title || "Untitled"}
                  </Text>
                  {!!viewingArt.description?.medium && (
                    <Text style={styles.artViewMeta}>
                      Medium: {viewingArt.description.medium}
                    </Text>
                  )}
                  {!!viewingArt.description?.size && (
                    <Text style={styles.artViewMeta}>
                      Size: {viewingArt.description.size}
                    </Text>
                  )}
                  {!!viewingArt.description?.description ? (
                    <Text style={styles.artViewDescription}>
                      {viewingArt.description.description}
                    </Text>
                  ) : (
                    <Text style={styles.artViewDescription}>
                      No description provided.
                    </Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </ImageBackground>
  );
}

function ArtistCard({ artist }: { artist: ArtistProfile }) {
  return (
    <>
      <View style={{ position: "relative" }}>
        <Image
          source={{ uri: artist.profile_pic }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        {artist.compatibility !== undefined && (
          <View style={styles.compatBadge}>
            <Text style={styles.compatText}>
              {Math.round(artist.compatibility)}% match
            </Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{artist.username}</Text>
        {artist.answers?.art_type && (
          <Text style={styles.cardDetail}>
            Art type: {artist.answers.art_type}
          </Text>
        )}
        {artist.answers?.years_experience && (
          <Text style={styles.cardDetail}>
            Experience: {artist.answers.years_experience} years
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 80,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 40,
    fontWeight: "bold",
    color: "#4d4139",
    marginBottom: 20,
  },

  cardStack: {
    width: SCREEN_WIDTH * 0.85,
    height: 450,
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 20,
    backgroundColor: "white",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  cardBehind: {
    top: 10,
    transform: [{ scale: 0.96 }],
  },

  cardImage: {
    width: "100%",
    height: "70%",
  },

  cardInfo: {
    padding: 16,
  },

  cardName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#4d4139",
    marginBottom: 6,
  },

  cardDetail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },

  actionRow: {
    flexDirection: "row",
    gap: 40,
    marginTop: 30,
  },

  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  passButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#e74c3c",
  },

  likeButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#2ecc71",
  },

  actionButtonText: {
    fontSize: 28,
    fontWeight: "700",
  },

  infoText: {
    fontSize: 16,
    color: "#4d4139",
    textAlign: "center",
  },

  emptyState: {
    alignItems: "center",
    gap: 16,
  },

  refreshButton: {
    backgroundColor: "black",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },

  refreshButtonText: {
    color: "white",
    fontWeight: "600",
  },

  compatBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#3a332c",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  compatText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },

  infoButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#4d4139",
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

  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f0e6",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f5f0e6",
    borderBottomWidth: 1,
    borderBottomColor: "#e0d8ce",
  },

  modalBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    width: 70,
  },

  modalBackText: {
    fontSize: 16,
    color: "#3a332c",
    fontWeight: "600",
  },

  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#3a332c",
    flex: 1,
    textAlign: "center",
  },

  modalBadgeText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },

  profileHeaderImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ddd",
  },

  profileHeaderName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#3a332c",
  },

  profileHeaderSubtitle: {
    fontSize: 14,
    color: "#6b6258",
    marginTop: 4,
  },

  profileMatchBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#3a332c",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },

  profileScreen: {
    flex: 1,
    width: "96%",
    borderRadius: 45,
    marginBottom: 10,
    backgroundColor: "#f5f0e6",
    alignSelf: "center",
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

  artOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#f5f0e6",
    zIndex: 20,
    elevation: 20,
  },

  artPostImageWrapper: {
    position: "relative",
  },

  artPostImage: {
    width: "100%",
    height: SCREEN_WIDTH,
    backgroundColor: "#ddd",
  },

  artPostBody: {
    padding: 20,
  },

  artNavArrow: {
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

  artNavArrowLeft: {
    left: 12,
  },

  artNavArrowRight: {
    right: 12,
  },

  artViewTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3a332c",
    marginBottom: 6,
  },

  artViewMeta: {
    fontSize: 13,
    color: "#6b6258",
    marginBottom: 2,
  },

  artViewDescription: {
    fontSize: 14,
    color: "#3a332c",
    marginTop: 10,
    lineHeight: 20,
  },
});
