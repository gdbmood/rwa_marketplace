import { FieldType } from '@/constants';
import { db } from '@/lib/firebaseClient';
import { create } from 'zustand';

type CategoryWithoutFields = {
    _id: string;
    isEnabled: boolean;
    name: string;
    image: string;
}
export type Category = CategoryWithoutFields & {
    fields: FieldType[];
}

const categoryStore = create<
    {
        categories: Category[];
        setCategories: (newState: Category[]) => void;
        fetchCategories: () => Promise<Category[]>;
    }
>((set, get) => ({
    categories: [],
    setCategories: (newState: Category[]) => set({ categories: newState }),
    fetchCategories: async () => {
        try {
            const response = await db.collection('AssetCategory').get();
            const categories: Category[] = [];
            await Promise.all(response.docs.map(async (doc) => {
                const data = { _id: doc.id, ...doc.data() } as CategoryWithoutFields;
                if (data && data.isEnabled) {
                    const fieldsSnapshot = await db.collection('AssetCategory').doc(data._id).collection('fields').get();
                    categories.push({
                        _id: data._id,
                        isEnabled: data.isEnabled,
                        name: data.name,
                        image: data.image,
                        fields: fieldsSnapshot.docs.map(fieldDoc => fieldDoc.data() as FieldType)
                    });
                }
            }));
            set({ categories });
            return categories;
        } catch (error) {
            console.error("Error fetching categories:", error);
            throw error;
        }
    }
}));

export default categoryStore;