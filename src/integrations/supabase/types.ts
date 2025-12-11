export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cashiers: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          device_id: string | null
          id: string
          local_id: number | null
          name: string
          pin: string
          role: string
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          local_id?: number | null
          name: string
          pin: string
          role: string
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          id?: string
          local_id?: number | null
          name?: string
          pin?: string
          role?: string
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          local_id: number | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          local_id?: number | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          local_id?: number | null
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          device_id: string | null
          email: string | null
          id: string
          loan_balance: number | null
          loan_purchases: Json | null
          local_id: number | null
          loyalty_points: number | null
          name: string
          notes: string | null
          phone: string
          synced_at: string | null
          total_purchases: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          email?: string | null
          id?: string
          loan_balance?: number | null
          loan_purchases?: Json | null
          local_id?: number | null
          loyalty_points?: number | null
          name: string
          notes?: string | null
          phone: string
          synced_at?: string | null
          total_purchases?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          email?: string | null
          id?: string
          loan_balance?: number | null
          loan_purchases?: Json | null
          local_id?: number | null
          loyalty_points?: number | null
          name?: string
          notes?: string | null
          phone?: string
          synced_at?: string | null
          total_purchases?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string
          date: string
          deleted_at: string | null
          description: string | null
          device_id: string | null
          expense_type: string | null
          id: string
          local_id: number | null
          payment_method: string | null
          receipt: string | null
          synced_at: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by: string
          date: string
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          expense_type?: string | null
          id?: string
          local_id?: number | null
          payment_method?: string | null
          receipt?: string | null
          synced_at?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string
          date?: string
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          expense_type?: string | null
          id?: string
          local_id?: number | null
          payment_method?: string | null
          receipt?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string
          category: string | null
          cost_price: number
          created_at: string | null
          deleted_at: string | null
          device_id: string | null
          discount_end_date: string | null
          discount_percent: number | null
          discount_start_date: string | null
          id: string
          image: string | null
          local_id: number | null
          min_stock: number | null
          name: string
          selling_price: number
          stock: number | null
          supplier: string | null
          synced_at: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          barcode: string
          category?: string | null
          cost_price: number
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          discount_end_date?: string | null
          discount_percent?: number | null
          discount_start_date?: string | null
          id?: string
          image?: string | null
          local_id?: number | null
          min_stock?: number | null
          name: string
          selling_price: number
          stock?: number | null
          supplier?: string | null
          synced_at?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string
          category?: string | null
          cost_price?: number
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          discount_end_date?: string | null
          discount_percent?: number | null
          discount_start_date?: string | null
          id?: string
          image?: string | null
          local_id?: number | null
          min_stock?: number | null
          name?: string
          selling_price?: number
          stock?: number | null
          supplier?: string | null
          synced_at?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quick_quantities: {
        Row: {
          created_at: string | null
          id: string
          label: string
          local_id: number | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          local_id?: number | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          local_id?: number | null
          value?: number
        }
        Relationships: []
      }
      sales: {
        Row: {
          amount_paid: number
          cashier: string
          change: number | null
          customer_id: string | null
          customer_name: string | null
          device_id: string | null
          discount: number | null
          id: string
          items: Json
          local_id: number | null
          payment_method: string
          print_count: number | null
          print_history: Json | null
          subtotal: number
          synced_at: string | null
          tax: number | null
          timestamp: string | null
          total: number
        }
        Insert: {
          amount_paid: number
          cashier: string
          change?: number | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          discount?: number | null
          id?: string
          items: Json
          local_id?: number | null
          payment_method: string
          print_count?: number | null
          print_history?: Json | null
          subtotal: number
          synced_at?: string | null
          tax?: number | null
          timestamp?: string | null
          total: number
        }
        Update: {
          amount_paid?: number
          cashier?: string
          change?: number | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          discount?: number | null
          id?: string
          items?: Json
          local_id?: number | null
          payment_method?: string
          print_count?: number | null
          print_history?: Json | null
          subtotal?: number
          synced_at?: string | null
          tax?: number | null
          timestamp?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          currency: string | null
          export_file_name: string | null
          id: string
          logo: string | null
          receipt_footer: string | null
          receipt_header: string | null
          store_address: string | null
          store_mobile: string | null
          store_mobile2: string | null
          store_name: string
          store_phone: string | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          currency?: string | null
          export_file_name?: string | null
          id?: string
          logo?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          store_address?: string | null
          store_mobile?: string | null
          store_mobile2?: string | null
          store_name: string
          store_phone?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          currency?: string | null
          export_file_name?: string | null
          id?: string
          logo?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          store_address?: string | null
          store_mobile?: string | null
          store_mobile2?: string | null
          store_name?: string
          store_phone?: string | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact: string | null
          created_at: string | null
          id: string
          local_id: number | null
          name: string
        }
        Insert: {
          contact?: string | null
          created_at?: string | null
          id?: string
          local_id?: number | null
          name: string
        }
        Update: {
          contact?: string | null
          created_at?: string | null
          id?: string
          local_id?: number | null
          name?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          created_at: string | null
          id: string
          local_id: number | null
          name: string
          symbol: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          local_id?: number | null
          name: string
          symbol: string
        }
        Update: {
          created_at?: string | null
          id?: string
          local_id?: number | null
          name?: string
          symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
