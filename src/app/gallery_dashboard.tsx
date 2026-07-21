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
  ActivityIndicator,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { getRankedArtists } from "@/lib/matchApi";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

type ArtistProfile = {
  id: string;
  username: string;
  profile_pic: string;
  answers: Record<string, string>;
  compatibility?: number;
};

type GalleryImage = {
  id: string;
  image_url: string;
  description?: { title?: string; medium?: string };
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
  const [loadingImages, setLoadingImages] = useState(false);

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
      console.log("Matching backend unavailable, falling back to Supabase:", err);
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
    setLoadingImages(true);
    const { data } = await supabase
      .from("gallery_images")
      .select("id, image_url, description")
      .eq("user_id", artist.id)
      .order("created_at", { ascending: false })
      .limit(12);
    setModalImages(data ?? []);
    setLoadingImages(false);
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
              <Ionicons name="information-circle-outline" size={28} color="#4d4139" />
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
        <Pressable onPress={() => router.push("/messages")} style={styles.navIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/notifications")} style={styles.navIcon}>
          <Ionicons name="notifications-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/calendar")} style={styles.navIcon}>
          <Ionicons name="calendar-outline" size={26} color="#4d4139" />
        </Pressable>
        <Pressable onPress={() => router.push("/gallery_profile")} style={styles.navIcon}>
          <Ionicons name="person-outline" size={26} color="#4d4139" />
        </Pressable>
      </View>

      {/* ARTIST PROFILE MODAL */}
      <Modal visible={profileModal} animationType="slide" onRequestClose={() => setProfileModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalBackBtn} onPress={() => setProfileModal(false)}>
              <Ionicons name="chevron-back" size={26} color="#3a332c" />
              <Text style={styles.modalBackText}>Back</Text>
            </Pressable>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {modalArtist?.username ?? "Artist"}
            </Text>
            <View style={{ width: 70 }} />
          </View>

          {modalArtist && (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Image source={{ uri: modalArtist.profile_pic }} style={styles.modalAvatar} />
              <Text style={styles.modalName}>{modalArtist.username}</Text>
              {modalArtist.compatibility !== undefined && (
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>{Math.round(modalArtist.compatibility)}% match</Text>
                </View>
              )}

              <Text style={styles.modalSectionTitle}>About</Text>
              {modalArtist.answers?.art_type ? (
                <View style={styles.modalQA}>
                  <Text style={styles.modalQ}>Art type</Text>
                  <Text style={styles.modalA}>{modalArtist.answers.art_type}</Text>
                </View>
              ) : null}
              {modalArtist.answers?.years_experience ? (
                <View style={styles.modalQA}>
                  <Text style={styles.modalQ}>Experience</Text>
                  <Text style={styles.modalA}>{modalArtist.answers.years_experience} years</Text>
                </View>
              ) : null}

              <Text style={styles.modalSectionTitle}>Artwork</Text>
              {loadingImages ? (
                <ActivityIndicator color="#4d4139" style={{ marginTop: 16 }} />
              ) : modalImages.length === 0 ? (
                <Text style={styles.modalA}>No artwork uploaded yet.</Text>
              ) : (
                <View style={styles.artworkGrid}>
                  {modalImages.map((img) => (
                    <View key={img.id} style={styles.artworkCell}>
                      <Image source={{ uri: img.image_url }} style={styles.artworkThumb} resizeMode="cover" />
                      {img.description?.title ? (
                        <Text style={styles.artworkTitle} numberOfLines={1}>{img.description.title}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
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

  modalContent: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "center",
  },

  modalAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ddd",
    marginBottom: 12,
  },

  modalName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#3a332c",
    marginBottom: 8,
  },

  modalBadge: {
    backgroundColor: "#3a332c",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 20,
  },

  modalBadgeText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },

  modalSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3a332c",
    alignSelf: "flex-start",
    marginTop: 16,
    marginBottom: 10,
  },

  modalQA: {
    alignSelf: "stretch",
    marginBottom: 10,
  },

  modalQ: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3a332c",
  },

  modalA: {
    fontSize: 15,
    color: "#6b6258",
    marginTop: 2,
  },

  artworkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignSelf: "stretch",
    marginTop: 4,
  },

  artworkCell: {
    width: "47%",
  },

  artworkThumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#ddd",
  },

  artworkTitle: {
    fontSize: 12,
    color: "#6b6258",
    marginTop: 4,
  },
});
